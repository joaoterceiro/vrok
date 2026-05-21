/**
 * WhatsAppCloudAdapter — Meta Cloud API (oficial).
 * https://developers.facebook.com/docs/whatsapp/cloud-api
 */
import type {
  ChannelAdapter,
  ChannelConfig,
  IncomingEvent,
  OutboundPayload,
  SendResult,
  DownloadedMedia,
} from '../channel-types';
import {
  metaFetch,
  metaDownloadByUrl,
  metaResolveMediaUrl,
  resolveMetaConfig,
  verifyMetaSignature,
  type MetaConfig,
} from './meta-base';

interface WaCloudConfig extends MetaConfig {
  phoneNumberId: string;
}

function resolve(raw: ChannelConfig): WaCloudConfig {
  const cfg = resolveMetaConfig(raw) as WaCloudConfig;
  if (!cfg.phoneNumberId) throw new Error('WA Cloud: phoneNumberId is required');
  return cfg;
}

// ---- Webhook ----------------------------------------------------

function parseEvent(channelId: string, body: unknown): IncomingEvent[] {
  if (typeof body !== 'object' || body === null) return [];
  const root = body as { entry?: Array<{ changes?: Array<{ value?: Record<string, unknown> }> }> };
  const out: IncomingEvent[] = [];

  for (const entry of root.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      if (!value) continue;
      const contactsArr = (value.contacts as Array<{ wa_id: string; profile?: { name?: string } }>) ?? [];
      const messagesArr = (value.messages as Array<Record<string, unknown>>) ?? [];
      const statusesArr = (value.statuses as Array<Record<string, unknown>>) ?? [];

      for (const m of messagesArr) {
        const from = String(m.from ?? '');
        const id = String(m.id ?? `wac-${Date.now()}`);
        const ts = new Date(Number(m.timestamp ?? Math.floor(Date.now() / 1000)) * 1000);
        const profile = contactsArr.find((c) => c.wa_id === from)?.profile;

        const content = decodeMessage(m, id);
        if (!content) continue;

        out.push({
          channelId,
          providerMessageId: id,
          externalContactId: from,
          contactProfile: profile?.name ? { name: profile.name, phone: from } : { phone: from },
          timestamp: ts,
          content,
          raw: m,
        });
      }

      for (const s of statusesArr) {
        const id = String(s.id ?? '');
        const status = String(s.status ?? '');
        const mapped = mapStatus(status);
        if (!id || !mapped) continue;
        out.push({
          channelId,
          providerMessageId: id,
          externalContactId: '',
          timestamp: new Date(Number(s.timestamp ?? Math.floor(Date.now() / 1000)) * 1000),
          content: { type: 'status', messageId: id, status: mapped },
          raw: s,
        });
      }
    }
  }
  return out;
}

function decodeMessage(m: Record<string, unknown>, fallbackId: string): IncomingEvent['content'] | null {
  const t = String(m.type ?? '');
  if (t === 'text') {
    return { type: 'text', text: String((m.text as { body?: string } | undefined)?.body ?? '') };
  }
  if (t === 'image' || t === 'audio' || t === 'video' || t === 'document' || t === 'sticker') {
    const media = m[t] as { id?: string; mime_type?: string; caption?: string; filename?: string } | undefined;
    if (!media?.id) return null;
    return {
      type: 'media',
      mediaType: t,
      providerMediaId: media.id,
      mime: media.mime_type,
      caption: media.caption,
      filename: media.filename,
    };
  }
  if (t === 'location') {
    const loc = m.location as { latitude?: number; longitude?: number } | undefined;
    if (typeof loc?.latitude === 'number' && typeof loc.longitude === 'number') {
      return { type: 'location', lat: loc.latitude, lng: loc.longitude };
    }
  }
  return null;
}

function mapStatus(s: string): 'sent' | 'delivered' | 'read' | 'failed' | null {
  switch (s) {
    case 'sent':
      return 'sent';
    case 'delivered':
      return 'delivered';
    case 'read':
      return 'read';
    case 'failed':
      return 'failed';
    default:
      return null;
  }
}

// ---- Send -------------------------------------------------------

async function sendMessage(rawConfig: ChannelConfig, payload: OutboundPayload): Promise<SendResult> {
  const cfg = resolve(rawConfig);
  const path = `/${encodeURIComponent(cfg.phoneNumberId)}/messages`;
  const to = payload.to.replace(/\D/g, '');

  let body: Record<string, unknown>;
  if (payload.content.type === 'text') {
    body = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: { body: payload.content.text, preview_url: true },
    };
  } else if (payload.content.type === 'media') {
    const { mediaType, url, caption, filename } = payload.content;
    body = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: mediaType,
      [mediaType]: { link: url, caption, filename },
    };
  } else if (payload.content.type === 'template') {
    body = {
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name: payload.content.templateProviderId,
        language: { code: payload.content.language },
        components: payload.content.components,
      },
    };
  } else {
    throw new Error('WA Cloud: unsupported content type');
  }

  const res = await metaFetch(cfg, path, { method: 'POST', body: JSON.stringify(body) });
  const j = (await res.json()) as { messages?: Array<{ id: string }> };
  const id = j.messages?.[0]?.id ?? `wac-${Date.now()}`;
  return { providerMessageId: id, raw: j };
}

// ---- Media ------------------------------------------------------

async function downloadMedia(rawConfig: ChannelConfig, providerMediaId: string): Promise<DownloadedMedia> {
  const cfg = resolve(rawConfig);
  const url = await metaResolveMediaUrl(cfg, providerMediaId);
  return metaDownloadByUrl(cfg, url);
}

// ---- Webhook verification ---------------------------------------

async function verifyWebhook(req: Request, rawConfig: ChannelConfig): Promise<boolean> {
  const cfg = resolveMetaConfig(rawConfig);
  return verifyMetaSignature(req, cfg);
}

// ---- Adapter export ---------------------------------------------

export const WhatsAppCloudAdapter: ChannelAdapter = {
  type: 'wa_cloud',
  verifyWebhook,
  parseWebhook: (body) => {
    const channelId = (body as { __channelId?: string })?.__channelId ?? '';
    return parseEvent(channelId, body);
  },
  sendMessage,
  downloadMedia,
};

/**
 * GET handshake helper for the webhook route. Called from /api/webhooks/wa-cloud
 * when Meta validates the URL with `?hub.mode=subscribe&hub.verify_token=...`.
 */
export function handleMetaSubscribe(
  url: URL,
  cfg: ChannelConfig,
): { ok: true; challenge: string } | { ok: false } {
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');
  const decrypted = resolveMetaConfig(cfg);
  if (mode === 'subscribe' && token && challenge && token === decrypted.verifyToken) {
    return { ok: true, challenge };
  }
  return { ok: false };
}
