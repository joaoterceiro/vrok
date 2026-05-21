/**
 * EvolutionAdapter — fala com a Evolution API (Baileys) para enviar/receber
 * mensagens WhatsApp.
 *
 * Configuração esperada em `channel.config`:
 *   {
 *     instanceName: string;       // nome da instância na Evolution
 *     apiKey: string;             // chave de API (criptografada no DB)
 *     baseUrl?: string;           // opcional: override do EVOLUTION_BASE_URL
 *     webhookToken?: string;      // opcional: token validado em verifyWebhook
 *   }
 */
import { Readable } from 'node:stream';
import type {
  ChannelAdapter,
  ChannelConfig,
  IncomingEvent,
  OutboundPayload,
  SendResult,
  DownloadedMedia,
} from '../channel-types';
import { decryptConfig } from '../crypto';

interface EvolutionConfig extends ChannelConfig {
  instanceName: string;
  apiKey: string;
  baseUrl?: string;
  webhookToken?: string;
}

const ENC_FIELDS = ['apiKey', 'webhookToken'] as const;

function resolveConfig(raw: ChannelConfig): EvolutionConfig {
  const decrypted = decryptConfig(raw, ENC_FIELDS as readonly (keyof ChannelConfig & string)[]);
  const cfg = decrypted as EvolutionConfig;
  if (!cfg.instanceName) throw new Error('Evolution config: instanceName is required');
  // Self-hosted: the global EVOLUTION_API_KEY env beats whatever was stored.
  // Avoids stale/wrong keys from old channels created before the simplified
  // flow that lets the operator skip the field.
  const envKey = process.env.EVOLUTION_API_KEY;
  if (envKey) cfg.apiKey = envKey;
  if (!cfg.apiKey) throw new Error('Evolution config: apiKey is required');
  return cfg;
}

function getBaseUrl(cfg: EvolutionConfig): string {
  return (cfg.baseUrl ?? process.env.EVOLUTION_BASE_URL ?? 'http://evolution:8080').replace(
    /\/+$/,
    '',
  );
}

async function evoFetch(
  cfg: EvolutionConfig,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const url = `${getBaseUrl(cfg)}${path}`;
  const headers = new Headers(init?.headers);
  headers.set('apikey', cfg.apiKey);
  headers.set('Content-Type', 'application/json');
  const res = await fetch(url, { ...init, headers });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Evolution API ${path} → ${res.status}: ${text.slice(0, 500)}`);
  }
  return res;
}

// ---- Webhook parsing ------------------------------------------

function parseEvolutionEvent(channelId: string, raw: unknown): IncomingEvent[] {
  if (typeof raw !== 'object' || raw === null) return [];
  const evt = raw as Record<string, unknown>;
  const event = String(evt.event ?? '');
  if (event === 'messages.upsert') return parseUpsert(channelId, evt);
  if (event === 'messages.update') return parseUpdate(channelId, evt);
  return [];
}

function parseUpsert(channelId: string, evt: Record<string, unknown>): IncomingEvent[] {
  const data = evt.data as Record<string, unknown> | undefined;
  if (!data) return [];
  const key = data.key as { remoteJid?: string; id?: string; fromMe?: boolean } | undefined;
  if (!key || key.fromMe) return [];
  const remoteJid = key.remoteJid ?? '';
  if (!remoteJid || remoteJid.endsWith('@g.us')) return [];

  const providerMessageId = key.id ?? `evo-${Date.now()}`;
  const timestamp = new Date(Number(data.messageTimestamp ?? Date.now() / 1000) * 1000);
  const externalContactId = remoteJid.split('@')[0] ?? remoteJid;
  const pushName = (data.pushName as string | undefined) ?? undefined;

  const msg = (data.message ?? {}) as Record<string, unknown>;
  let content: IncomingEvent['content'] | null = null;

  if (typeof msg.conversation === 'string' && msg.conversation.length > 0) {
    content = { type: 'text', text: msg.conversation };
  } else if (
    msg.extendedTextMessage &&
    typeof (msg.extendedTextMessage as { text?: string }).text === 'string'
  ) {
    content = { type: 'text', text: (msg.extendedTextMessage as { text: string }).text };
  } else if (msg.imageMessage) {
    const m = msg.imageMessage as { caption?: string; mimetype?: string };
    content = {
      type: 'media',
      mediaType: 'image',
      providerMediaId: providerMessageId,
      caption: m.caption,
      mime: m.mimetype ?? 'image/jpeg',
    };
  } else if (msg.audioMessage) {
    const m = msg.audioMessage as { mimetype?: string };
    content = {
      type: 'media',
      mediaType: 'audio',
      providerMediaId: providerMessageId,
      mime: m.mimetype ?? 'audio/ogg',
    };
  } else if (msg.videoMessage) {
    const m = msg.videoMessage as { caption?: string; mimetype?: string };
    content = {
      type: 'media',
      mediaType: 'video',
      providerMediaId: providerMessageId,
      caption: m.caption,
      mime: m.mimetype ?? 'video/mp4',
    };
  } else if (msg.documentMessage) {
    const m = msg.documentMessage as { fileName?: string; mimetype?: string; caption?: string };
    content = {
      type: 'media',
      mediaType: 'document',
      providerMediaId: providerMessageId,
      filename: m.fileName,
      caption: m.caption,
      mime: m.mimetype ?? 'application/octet-stream',
    };
  } else if (msg.stickerMessage) {
    content = { type: 'media', mediaType: 'sticker', providerMediaId: providerMessageId, mime: 'image/webp' };
  } else if (msg.locationMessage) {
    const m = msg.locationMessage as { degreesLatitude?: number; degreesLongitude?: number };
    if (typeof m.degreesLatitude === 'number' && typeof m.degreesLongitude === 'number') {
      content = { type: 'location', lat: m.degreesLatitude, lng: m.degreesLongitude };
    }
  }

  if (!content) return [];

  return [
    {
      channelId,
      providerMessageId,
      externalContactId,
      contactProfile: pushName ? { name: pushName, phone: externalContactId } : undefined,
      timestamp,
      content,
      raw: evt,
    },
  ];
}

function parseUpdate(channelId: string, evt: Record<string, unknown>): IncomingEvent[] {
  const data = evt.data;
  const updates = Array.isArray(data) ? data : [data];
  return updates.flatMap((u) => {
    if (typeof u !== 'object' || u === null) return [];
    const update = u as Record<string, unknown>;
    const key = update.key as { id?: string } | undefined;
    const status = update.update as { status?: number | string } | undefined;
    if (!key?.id || !status?.status) return [];
    const mapped = normalizeStatus(String(status.status));
    if (!mapped) return [];
    return [
      {
        channelId,
        providerMessageId: key.id,
        externalContactId: '',
        timestamp: new Date(),
        content: { type: 'status', messageId: key.id, status: mapped },
        raw: update,
      } as IncomingEvent,
    ];
  });
}

function normalizeStatus(raw: string): 'sent' | 'delivered' | 'read' | 'failed' | null {
  switch (raw) {
    case '0':
    case 'ERROR':
      return 'failed';
    case '1':
    case 'PENDING':
      return null;
    case '2':
    case 'SERVER_ACK':
    case 'SENT':
      return 'sent';
    case '3':
    case 'DELIVERY_ACK':
    case 'DELIVERED':
      return 'delivered';
    case '4':
    case '5':
    case 'READ':
    case 'PLAYED':
      return 'read';
    default:
      return null;
  }
}

// ---- Send -----------------------------------------------------

function jidFromPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return `${digits}@s.whatsapp.net`;
}

async function sendMessage(rawConfig: ChannelConfig, payload: OutboundPayload): Promise<SendResult> {
  const cfg = resolveConfig(rawConfig);
  const jid = payload.to.includes('@') ? payload.to : jidFromPhone(payload.to);

  if (payload.content.type === 'text') {
    const res = await evoFetch(cfg, `/message/sendText/${encodeURIComponent(cfg.instanceName)}`, {
      method: 'POST',
      body: JSON.stringify({ number: jid, text: payload.content.text }),
    });
    const body = (await res.json()) as { key?: { id?: string } };
    return { providerMessageId: body.key?.id ?? `evo-${Date.now()}`, raw: body };
  }

  if (payload.content.type === 'media') {
    const { mediaType, url, caption, mime, filename } = payload.content;
    // Audio uses a different endpoint + body shape than other media types.
    const isAudio = mediaType === 'audio';
    const endpoint = isAudio ? 'sendWhatsAppAudio' : 'sendMedia';
    const reqBody: Record<string, unknown> = isAudio
      ? { number: jid, audio: url, encoding: true }
      : {
          number: jid,
          mediatype: mediaType,
          mimetype: mime,
          fileName: filename,
          caption,
          media: url,
        };
    const res = await evoFetch(
      cfg,
      `/message/${endpoint}/${encodeURIComponent(cfg.instanceName)}`,
      { method: 'POST', body: JSON.stringify(reqBody) },
    );
    const body = (await res.json()) as { key?: { id?: string } };
    return { providerMessageId: body.key?.id ?? `evo-${Date.now()}`, raw: body };
  }

  if (payload.content.type === 'template') {
    throw new Error('Evolution channel: template messages should be rendered to text upstream');
  }

  throw new Error('Evolution adapter: unsupported outbound content type');
}

// ---- Download media -------------------------------------------

async function downloadMedia(
  rawConfig: ChannelConfig,
  providerMediaId: string,
): Promise<DownloadedMedia> {
  const cfg = resolveConfig(rawConfig);
  const res = await evoFetch(
    cfg,
    `/chat/getBase64FromMediaMessage/${encodeURIComponent(cfg.instanceName)}`,
    {
      method: 'POST',
      body: JSON.stringify({ message: { key: { id: providerMediaId } }, convertToMp4: false }),
    },
  );
  const body = (await res.json()) as { base64?: string; mimetype?: string; fileName?: string };
  if (!body.base64) throw new Error('Evolution downloadMedia: empty base64 payload');
  const buf = Buffer.from(body.base64, 'base64');
  return {
    stream: Readable.from(buf),
    mime: body.mimetype ?? 'application/octet-stream',
    size: buf.byteLength,
    filename: body.fileName,
  };
}

// ---- Read receipt ---------------------------------------------

async function markAsRead(rawConfig: ChannelConfig, providerMessageId: string): Promise<void> {
  const cfg = resolveConfig(rawConfig);
  await evoFetch(cfg, `/chat/markMessageAsRead/${encodeURIComponent(cfg.instanceName)}`, {
    method: 'POST',
    body: JSON.stringify({ readMessages: [{ id: providerMessageId }] }),
  });
}

// ---- Webhook auth ---------------------------------------------

async function verifyWebhook(req: Request, rawConfig: ChannelConfig): Promise<boolean> {
  const cfg = decryptConfig(rawConfig, ['webhookToken'] as readonly (keyof ChannelConfig & string)[]) as {
    webhookToken?: string;
  };
  if (!cfg.webhookToken) return true;
  const sent = req.headers.get('x-zora-token') ?? req.headers.get('apikey');
  return sent === cfg.webhookToken;
}

// ---- Connect / disconnect helpers (not part of ChannelAdapter) -

/**
 * Creates the instance on Evolution and returns the QR/pairing code so the
 * operator can scan from WhatsApp. Handles both Evolution API v1 (flat shape)
 * and v2 (nested under `qrcode`), and detects instances already connected.
 */
export async function evolutionConnect(
  rawConfig: ChannelConfig,
): Promise<{
  qrCode?: string;
  pairingCode?: string;
  alreadyConnected?: boolean;
  raw: unknown;
}> {
  const cfg = resolveConfig(rawConfig);

  // 1) Check if the instance is already paired with a phone — short-circuit
  // before touching anything else so we don't accidentally log out a working
  // connection.
  try {
    const statusRes = await evoFetch(
      cfg,
      `/instance/fetchInstances?instanceName=${encodeURIComponent(cfg.instanceName)}`,
      { method: 'GET' },
    );
    const statusBody = (await statusRes.json().catch(() => null)) as unknown;
    if (isAlreadyConnected(statusBody)) {
      return { alreadyConnected: true, raw: statusBody };
    }
  } catch {
    /* fetchInstances may fail on older versions — ignore */
  }

  // 2) Force a clean state. If the instance exists but is disconnected/stuck,
  // delete it; then recreate. This eliminates the "{count:0} forever" issue
  // caused by stale Baileys sessions.
  await evoFetch(cfg, `/instance/delete/${encodeURIComponent(cfg.instanceName)}`, {
    method: 'DELETE',
  }).catch(() => undefined);

  // 3) Create fresh. v2 returns the QR inline in the create response — try
  // to use it immediately.
  let createBody: unknown = null;
  try {
    const createRes = await evoFetch(cfg, '/instance/create', {
      method: 'POST',
      body: JSON.stringify({
        instanceName: cfg.instanceName,
        qrcode: true,
        integration: 'WHATSAPP-BAILEYS',
      }),
    });
    createBody = await createRes.json().catch(() => null);
    const parsed = extractQr(createBody);
    if (parsed.qrCode || parsed.pairingCode) {
      return { ...parsed, raw: createBody };
    }
  } catch (err) {
    /* if create itself failed, the polling below will surface the issue */
  }

  // 3) Poll `/instance/connect/{name}` — Evolution v2 often returns
  // `{count: 0}` on the first call while Baileys negotiates the socket;
  // the actual QR shows up after 1–3s. Retry up to 8 times (~12s total).
  let lastBody: unknown = null;
  for (let i = 0; i < 8; i++) {
    const qrRes = await evoFetch(
      cfg,
      `/instance/connect/${encodeURIComponent(cfg.instanceName)}`,
      { method: 'GET' },
    );
    lastBody = await qrRes.json().catch(() => null);
    const parsed = extractQr(lastBody);
    if (parsed.qrCode || parsed.pairingCode) {
      return { ...parsed, raw: lastBody };
    }
    // Re-check connection state — instance may have paired between polls.
    if (await isInstanceConnected(cfg)) {
      return { alreadyConnected: true, raw: lastBody };
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  return { raw: lastBody };
}

async function isInstanceConnected(cfg: EvolutionConfig): Promise<boolean> {
  try {
    const res = await evoFetch(
      cfg,
      `/instance/fetchInstances?instanceName=${encodeURIComponent(cfg.instanceName)}`,
      { method: 'GET' },
    );
    const body = await res.json().catch(() => null);
    return isAlreadyConnected(body);
  } catch {
    return false;
  }
}

function extractQr(body: unknown): { qrCode?: string; pairingCode?: string } {
  if (!body || typeof body !== 'object') return {};
  const b = body as Record<string, unknown>;
  // v1 flat:   { base64, code, pairingCode }
  // v2 nested: { qrcode: { base64, code, pairingCode }, instance: {...} }
  const flat = b as { base64?: string; pairingCode?: string; code?: string };
  const nested = (b.qrcode ?? {}) as { base64?: string; pairingCode?: string; code?: string };
  const qrCode = flat.base64 ?? nested.base64 ?? undefined;
  const pairingCode = flat.pairingCode ?? nested.pairingCode ?? undefined;
  return { qrCode, pairingCode };
}

function isAlreadyConnected(body: unknown): boolean {
  if (!body) return false;
  // fetchInstances can return an array or a single object depending on version.
  const list = Array.isArray(body) ? body : [body];
  for (const item of list) {
    if (typeof item !== 'object' || item === null) continue;
    const o = item as Record<string, unknown>;
    const state =
      (o.state as string | undefined) ??
      ((o.instance as { state?: string } | undefined)?.state) ??
      ((o.connectionStatus as string | undefined));
    if (state === 'open' || state === 'connected' || state === 'CONNECTED') return true;
  }
  return false;
}

/** Disconnect (logout) the instance from WhatsApp. */
export async function evolutionLogout(rawConfig: ChannelConfig): Promise<void> {
  const cfg = resolveConfig(rawConfig);
  await evoFetch(cfg, `/instance/logout/${encodeURIComponent(cfg.instanceName)}`, {
    method: 'DELETE',
  }).catch(() => undefined);
}

/**
 * Permanently deletes the instance from the Evolution server (logs out
 * first so the WhatsApp session is dropped cleanly). Both calls are
 * best-effort — the local channel row should always be removed even if
 * the Evolution server is unreachable.
 */
export async function evolutionDeleteInstance(rawConfig: ChannelConfig): Promise<void> {
  const cfg = resolveConfig(rawConfig);
  await evoFetch(cfg, `/instance/logout/${encodeURIComponent(cfg.instanceName)}`, {
    method: 'DELETE',
  }).catch(() => undefined);
  await evoFetch(cfg, `/instance/delete/${encodeURIComponent(cfg.instanceName)}`, {
    method: 'DELETE',
  }).catch(() => undefined);
}

/** Configure the webhook URL on the Evolution instance. */
export async function evolutionSetWebhook(
  rawConfig: ChannelConfig,
  webhookUrl: string,
): Promise<void> {
  const cfg = resolveConfig(rawConfig);
  await evoFetch(cfg, `/webhook/set/${encodeURIComponent(cfg.instanceName)}`, {
    method: 'POST',
    body: JSON.stringify({
      webhook: {
        enabled: true,
        url: webhookUrl,
        webhookByEvents: false,
        webhookBase64: false,
        events: ['MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'CONNECTION_UPDATE'],
      },
    }),
  });
}

// ---- History sync helpers --------------------------------------

export interface EvolutionContactRow {
  remoteJid: string;
  pushName?: string | null;
  profilePicUrl?: string | null;
  /** raw Evolution row, kept for the worker to access extra fields */
  raw: Record<string, unknown>;
}

/**
 * Paginates `POST /chat/findContacts/{instance}`. Evolution returns a flat
 * array — we slice client-side using `skip/limit` until empty.
 */
export async function evolutionFindContacts(
  rawConfig: ChannelConfig,
  opts: { skip?: number; limit?: number } = {},
): Promise<EvolutionContactRow[]> {
  const cfg = resolveConfig(rawConfig);
  const limit = opts.limit ?? 100;
  const skip = opts.skip ?? 0;
  const res = await evoFetch(
    cfg,
    `/chat/findContacts/${encodeURIComponent(cfg.instanceName)}`,
    {
      method: 'POST',
      body: JSON.stringify({ where: {} }),
    },
  );
  const all = (await res.json().catch(() => [])) as Array<Record<string, unknown>>;
  return all
    .slice(skip, skip + limit)
    .map((r) => ({
      remoteJid: String(r.remoteJid ?? r.id ?? ''),
      pushName: (r.pushName as string | undefined) ?? null,
      profilePicUrl: (r.profilePicUrl as string | undefined) ?? null,
      raw: r,
    }))
    .filter((c) => c.remoteJid && !c.remoteJid.endsWith('@g.us'));
}

export interface EvolutionChatRow {
  /**
   * The JID that messages are actually stored under — typically a `@lid`
   * identifier on modern WhatsApp installs. Use this for `findMessages`.
   */
  remoteJid: string;
  /**
   * The classic phone-number JID (`@s.whatsapp.net`) when WhatsApp has linked
   * the two. Falls back to remoteJid. Used to derive the contact phone.
   */
  phoneJid: string | null;
  pushName: string | null;
  profilePicUrl: string | null;
  lastMessageAt: Date | null;
  unreadCount: number;
  raw: Record<string, unknown>;
}

/**
 * Paginates `POST /chat/findChats/{instance}` — returns only chats with
 * actual conversation history (unlike `findContacts` which dumps the entire
 * address book). Each chat already has the canonical `remoteJid` Evolution
 * stores messages under, including the modern `@lid` form.
 */
export async function evolutionFindChats(
  rawConfig: ChannelConfig,
  opts: { skip?: number; limit?: number } = {},
): Promise<EvolutionChatRow[]> {
  const cfg = resolveConfig(rawConfig);
  const limit = opts.limit ?? 100;
  const skip = opts.skip ?? 0;
  const res = await evoFetch(
    cfg,
    `/chat/findChats/${encodeURIComponent(cfg.instanceName)}`,
    {
      method: 'POST',
      body: JSON.stringify({}),
    },
  );
  const all = (await res.json().catch(() => [])) as Array<Record<string, unknown>>;
  if (!Array.isArray(all)) return [];

  return all
    .slice(skip, skip + limit)
    .map((r) => {
      const remoteJid = String(r.remoteJid ?? '');
      const lastMessage = r.lastMessage as
        | { key?: { remoteJidAlt?: string }; messageTimestamp?: number }
        | undefined;
      const phoneJidRaw = lastMessage?.key?.remoteJidAlt ?? null;
      const phoneJid =
        typeof phoneJidRaw === 'string' && phoneJidRaw.endsWith('@s.whatsapp.net')
          ? phoneJidRaw
          : remoteJid.endsWith('@s.whatsapp.net')
            ? remoteJid
            : null;
      const ts = lastMessage?.messageTimestamp;
      const lastMessageAt =
        typeof ts === 'number'
          ? new Date(ts * 1000)
          : r.updatedAt
            ? new Date(String(r.updatedAt))
            : null;
      return {
        remoteJid,
        phoneJid,
        pushName: (r.pushName as string | undefined) ?? null,
        profilePicUrl: (r.profilePicUrl as string | undefined) ?? null,
        lastMessageAt,
        unreadCount: Number(r.unreadCount ?? 0) || 0,
        raw: r,
      };
    })
    .filter(
      (c) =>
        c.remoteJid &&
        !c.remoteJid.endsWith('@g.us') &&
        !c.remoteJid.endsWith('@broadcast') &&
        !c.remoteJid.endsWith('@newsletter'),
    );
}

export interface EvolutionMessageRow {
  providerMessageId: string;
  remoteJid: string;
  fromMe: boolean;
  timestamp: Date;
  body: string | null;
  /** Best-effort content type detection. */
  contentType: 'text' | 'image' | 'audio' | 'video' | 'document' | 'sticker' | 'location' | 'unknown';
  /** Raw message object, for downstream parsers that want full fidelity. */
  raw: Record<string, unknown>;
}

/**
 * Paginates `POST /chat/findMessages/{instance}` filtered by remoteJid.
 * Evolution v2 returns `{ messages: { records: [...], total } }`; older v1
 * returned a flat array. We handle both shapes.
 */
export async function evolutionFindMessages(
  rawConfig: ChannelConfig,
  remoteJid: string,
  opts: { page?: number; limit?: number } = {},
): Promise<{ rows: EvolutionMessageRow[]; total: number }> {
  const cfg = resolveConfig(rawConfig);
  const page = opts.page ?? 1;
  const limit = opts.limit ?? 100;
  const res = await evoFetch(
    cfg,
    `/chat/findMessages/${encodeURIComponent(cfg.instanceName)}`,
    {
      method: 'POST',
      body: JSON.stringify({
        where: { key: { remoteJid } },
        page,
        offset: limit,
      }),
    },
  );
  const body = (await res.json().catch(() => null)) as unknown;
  const { records, total } = normalizeFindMessagesBody(body);

  const rows: EvolutionMessageRow[] = records
    .map((r) => parseHistoricalMessage(r))
    .filter((m): m is EvolutionMessageRow => m !== null);

  return { rows, total };
}

function normalizeFindMessagesBody(
  body: unknown,
): { records: Array<Record<string, unknown>>; total: number } {
  if (Array.isArray(body)) {
    return { records: body as Array<Record<string, unknown>>, total: body.length };
  }
  if (body && typeof body === 'object') {
    const obj = body as Record<string, unknown>;
    const messagesObj = (obj.messages ?? obj) as {
      records?: Array<Record<string, unknown>>;
      total?: number;
    };
    return {
      records: messagesObj.records ?? [],
      total: messagesObj.total ?? messagesObj.records?.length ?? 0,
    };
  }
  return { records: [], total: 0 };
}

function parseHistoricalMessage(r: Record<string, unknown>): EvolutionMessageRow | null {
  const key = r.key as { id?: string; remoteJid?: string; fromMe?: boolean } | undefined;
  if (!key?.id || !key.remoteJid) return null;
  if (key.remoteJid.endsWith('@g.us')) return null;

  const ts = r.messageTimestamp;
  const timestamp = typeof ts === 'number'
    ? new Date(ts * 1000)
    : typeof ts === 'string'
    ? new Date(Number(ts) * 1000)
    : new Date();

  const msg = (r.message ?? {}) as Record<string, unknown>;
  let body: string | null = null;
  let contentType: EvolutionMessageRow['contentType'] = 'unknown';

  if (typeof msg.conversation === 'string' && msg.conversation.length > 0) {
    body = msg.conversation;
    contentType = 'text';
  } else if (
    msg.extendedTextMessage &&
    typeof (msg.extendedTextMessage as { text?: string }).text === 'string'
  ) {
    body = (msg.extendedTextMessage as { text: string }).text;
    contentType = 'text';
  } else if (msg.imageMessage) {
    body = ((msg.imageMessage as { caption?: string }).caption) ?? null;
    contentType = 'image';
  } else if (msg.audioMessage) {
    contentType = 'audio';
  } else if (msg.videoMessage) {
    body = ((msg.videoMessage as { caption?: string }).caption) ?? null;
    contentType = 'video';
  } else if (msg.documentMessage) {
    body = ((msg.documentMessage as { caption?: string }).caption) ?? null;
    contentType = 'document';
  } else if (msg.stickerMessage) {
    contentType = 'sticker';
  } else if (msg.locationMessage) {
    const m = msg.locationMessage as { degreesLatitude?: number; degreesLongitude?: number };
    if (typeof m.degreesLatitude === 'number' && typeof m.degreesLongitude === 'number') {
      body = `Localização: ${m.degreesLatitude.toFixed(5)}, ${m.degreesLongitude.toFixed(5)}`;
      contentType = 'location';
    }
  }

  return {
    providerMessageId: key.id,
    remoteJid: key.remoteJid,
    fromMe: !!key.fromMe,
    timestamp,
    body,
    contentType,
    raw: r,
  };
}

// ---- Export adapter -------------------------------------------

export const EvolutionAdapter: ChannelAdapter = {
  type: 'wa_evolution',
  verifyWebhook,
  parseWebhook: (body, _config) => {
    const channelId = (body as { __channelId?: string })?.__channelId ?? '';
    return parseEvolutionEvent(channelId, body);
  },
  sendMessage,
  downloadMedia,
  markAsRead,
};
