/**
 * TelegramAdapter — Telegram Bot API.
 * https://core.telegram.org/bots/api
 *
 * Configuração:
 *   {
 *     botToken: string;            // criptografado
 *     webhookSecret?: string;      // criptografado; validado em verifyWebhook
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

interface TelegramConfig extends ChannelConfig {
  botToken: string;
  webhookSecret?: string;
}

const ENC_FIELDS = ['botToken', 'webhookSecret'] as const;

function resolve(raw: ChannelConfig): TelegramConfig {
  const decrypted = decryptConfig(raw, ENC_FIELDS as readonly (keyof ChannelConfig & string)[]);
  const cfg = decrypted as TelegramConfig;
  if (!cfg.botToken) throw new Error('Telegram: botToken is required');
  return cfg;
}

const BOT_BASE = 'https://api.telegram.org';

async function botFetch(cfg: TelegramConfig, method: string, body?: Record<string, unknown>): Promise<unknown> {
  const url = `${BOT_BASE}/bot${cfg.botToken}/${method}`;
  const res = await fetch(url, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = (await res.json()) as { ok: boolean; result?: unknown; description?: string };
  if (!j.ok) throw new Error(`Telegram ${method} failed: ${j.description ?? res.status}`);
  return j.result;
}

// ---- Webhook ----------------------------------------------------

function parseEvent(channelId: string, body: unknown): IncomingEvent[] {
  if (typeof body !== 'object' || body === null) return [];
  const upd = body as {
    message?: Record<string, unknown>;
    edited_message?: Record<string, unknown>;
  };
  const msg = upd.message ?? upd.edited_message;
  if (!msg) return [];

  const from = msg.from as { id: number; first_name?: string; last_name?: string; username?: string } | undefined;
  const chat = msg.chat as { id: number; type: string } | undefined;
  if (!from || !chat || chat.type !== 'private') return [];

  const id = String(msg.message_id ?? `tg-${Date.now()}`);
  const ts = new Date(Number(msg.date ?? Date.now() / 1000) * 1000);
  const name = [from.first_name, from.last_name].filter(Boolean).join(' ').trim() || from.username || `user${from.id}`;
  const externalContactId = String(chat.id);

  let content: IncomingEvent['content'] | null = null;

  if (typeof msg.text === 'string') {
    content = { type: 'text', text: msg.text };
  } else if (Array.isArray(msg.photo)) {
    const photos = msg.photo as Array<{ file_id: string }>;
    const biggest = photos[photos.length - 1];
    if (biggest) {
      content = {
        type: 'media',
        mediaType: 'image',
        providerMediaId: biggest.file_id,
        caption: typeof msg.caption === 'string' ? msg.caption : undefined,
        mime: 'image/jpeg',
      };
    }
  } else if (msg.voice) {
    const v = msg.voice as { file_id: string; mime_type?: string };
    content = { type: 'media', mediaType: 'audio', providerMediaId: v.file_id, mime: v.mime_type ?? 'audio/ogg' };
  } else if (msg.audio) {
    const a = msg.audio as { file_id: string; mime_type?: string; file_name?: string };
    content = {
      type: 'media',
      mediaType: 'audio',
      providerMediaId: a.file_id,
      mime: a.mime_type ?? 'audio/mpeg',
      filename: a.file_name,
    };
  } else if (msg.video) {
    const v = msg.video as { file_id: string; mime_type?: string };
    content = { type: 'media', mediaType: 'video', providerMediaId: v.file_id, mime: v.mime_type ?? 'video/mp4' };
  } else if (msg.document) {
    const d = msg.document as { file_id: string; mime_type?: string; file_name?: string };
    content = {
      type: 'media',
      mediaType: 'document',
      providerMediaId: d.file_id,
      mime: d.mime_type ?? 'application/octet-stream',
      filename: d.file_name,
    };
  } else if (msg.sticker) {
    const s = msg.sticker as { file_id: string };
    content = { type: 'media', mediaType: 'sticker', providerMediaId: s.file_id, mime: 'image/webp' };
  } else if (msg.location) {
    const loc = msg.location as { latitude?: number; longitude?: number };
    if (typeof loc.latitude === 'number' && typeof loc.longitude === 'number') {
      content = { type: 'location', lat: loc.latitude, lng: loc.longitude };
    }
  }

  if (!content) return [];

  return [
    {
      channelId,
      providerMessageId: id,
      externalContactId,
      contactProfile: { name },
      timestamp: ts,
      content,
      raw: upd,
    },
  ];
}

// ---- Send -------------------------------------------------------

async function sendMessage(rawConfig: ChannelConfig, payload: OutboundPayload): Promise<SendResult> {
  const cfg = resolve(rawConfig);
  const chatId = Number(payload.to);

  if (payload.content.type === 'text') {
    const result = (await botFetch(cfg, 'sendMessage', {
      chat_id: chatId,
      text: payload.content.text,
    })) as { message_id?: number };
    return { providerMessageId: String(result.message_id ?? `tg-${Date.now()}`), raw: result };
  }

  if (payload.content.type === 'media') {
    const { mediaType, url, caption } = payload.content;
    const method =
      mediaType === 'image'
        ? 'sendPhoto'
        : mediaType === 'audio'
          ? 'sendAudio'
          : mediaType === 'video'
            ? 'sendVideo'
            : 'sendDocument';
    const fieldKey = mediaType === 'image' ? 'photo' : mediaType;
    const result = (await botFetch(cfg, method, {
      chat_id: chatId,
      [fieldKey]: url,
      caption,
    })) as { message_id?: number };
    return { providerMessageId: String(result.message_id ?? `tg-${Date.now()}`), raw: result };
  }

  throw new Error('Telegram: unsupported content type');
}

// ---- Media download via getFile -> download ---------------------

async function downloadMedia(rawConfig: ChannelConfig, providerMediaId: string): Promise<DownloadedMedia> {
  const cfg = resolve(rawConfig);
  const file = (await botFetch(cfg, 'getFile', { file_id: providerMediaId })) as {
    file_path?: string;
    file_size?: number;
  };
  if (!file.file_path) throw new Error('Telegram getFile: empty file_path');
  const url = `${BOT_BASE}/file/bot${cfg.botToken}/${file.file_path}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Telegram download failed: ${res.status}`);
  const mime = res.headers.get('content-type') ?? 'application/octet-stream';
  const buf = Buffer.from(await res.arrayBuffer());
  return { stream: Readable.from(buf), mime, size: buf.byteLength };
}

async function verifyWebhook(req: Request, rawConfig: ChannelConfig): Promise<boolean> {
  const cfg = resolve(rawConfig);
  if (!cfg.webhookSecret) return true;
  return req.headers.get('x-telegram-bot-api-secret-token') === cfg.webhookSecret;
}

// ---- Bot wiring helpers (registry) ------------------------------

export async function telegramSetWebhook(
  rawConfig: ChannelConfig,
  webhookUrl: string,
): Promise<void> {
  const cfg = resolve(rawConfig);
  await botFetch(cfg, 'setWebhook', {
    url: webhookUrl,
    secret_token: cfg.webhookSecret ?? undefined,
    allowed_updates: ['message', 'edited_message'],
  });
}

export async function telegramDeleteWebhook(rawConfig: ChannelConfig): Promise<void> {
  const cfg = resolve(rawConfig);
  await botFetch(cfg, 'deleteWebhook', {});
}

export const TelegramAdapter: ChannelAdapter = {
  type: 'telegram',
  verifyWebhook,
  parseWebhook: (body) => {
    const channelId = (body as { __channelId?: string })?.__channelId ?? '';
    return parseEvent(channelId, body);
  },
  sendMessage,
  downloadMedia,
};
