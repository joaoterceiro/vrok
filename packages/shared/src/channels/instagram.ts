/**
 * InstagramAdapter — Instagram Direct via Meta Graph (Page-based messaging).
 * https://developers.facebook.com/docs/messenger-platform/instagram/get-started
 *
 * Note: Instagram messaging requires:
 *   - A Facebook Page connected to an Instagram Business account
 *   - `instagram_basic`, `instagram_manage_messages`, `pages_manage_metadata`
 *   - Webhook subscribed to the Page on the `messages` field
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
  resolveMetaConfig,
  verifyMetaSignature,
  type MetaConfig,
} from './meta-base';

interface InstagramConfig extends MetaConfig {
  igBusinessAccountId: string;
}

function resolve(raw: ChannelConfig): InstagramConfig {
  const cfg = resolveMetaConfig(raw) as InstagramConfig;
  if (!cfg.igBusinessAccountId) {
    throw new Error('Instagram: igBusinessAccountId is required');
  }
  return cfg;
}

// ---- Webhook ----------------------------------------------------

function parseEvent(channelId: string, body: unknown): IncomingEvent[] {
  if (typeof body !== 'object' || body === null) return [];
  const root = body as { entry?: Array<{ messaging?: Array<Record<string, unknown>> }> };
  const out: IncomingEvent[] = [];

  for (const entry of root.entry ?? []) {
    for (const m of entry.messaging ?? []) {
      const sender = m.sender as { id?: string } | undefined;
      const recipient = m.recipient as { id?: string } | undefined;
      const message = m.message as
        | {
            mid?: string;
            text?: string;
            attachments?: Array<{ type: string; payload: { url?: string } }>;
            is_echo?: boolean;
          }
        | undefined;
      if (!sender?.id || !message || message.is_echo) continue;
      const id = message.mid ?? `ig-${Date.now()}`;
      const ts = new Date(Number(m.timestamp ?? Date.now()));

      let content: IncomingEvent['content'] | null = null;
      if (message.text) {
        content = { type: 'text', text: message.text };
      } else if (message.attachments && message.attachments.length > 0) {
        const att = message.attachments[0]!;
        const mediaType = mapAttachmentType(att.type);
        if (mediaType && att.payload?.url) {
          content = {
            type: 'media',
            mediaType,
            providerMediaId: att.payload.url,
            mime: undefined,
          };
        }
      }
      if (!content) continue;
      out.push({
        channelId,
        providerMessageId: id,
        externalContactId: sender.id,
        timestamp: ts,
        content,
        raw: m,
      });
    }
  }
  return out;
}

function mapAttachmentType(t: string): 'image' | 'audio' | 'video' | 'document' | null {
  if (t === 'image') return 'image';
  if (t === 'audio') return 'audio';
  if (t === 'video') return 'video';
  if (t === 'file' || t === 'document') return 'document';
  return null;
}

// ---- Send -------------------------------------------------------

async function sendMessage(rawConfig: ChannelConfig, payload: OutboundPayload): Promise<SendResult> {
  const cfg = resolve(rawConfig);
  const path = `/${encodeURIComponent(cfg.igBusinessAccountId)}/messages`;

  let body: Record<string, unknown>;
  if (payload.content.type === 'text') {
    body = {
      recipient: { id: payload.to },
      message: { text: payload.content.text },
    };
  } else if (payload.content.type === 'media') {
    body = {
      recipient: { id: payload.to },
      message: {
        attachment: {
          type: payload.content.mediaType,
          payload: { url: payload.content.url, is_reusable: false },
        },
      },
    };
  } else {
    throw new Error('Instagram: unsupported content type');
  }

  const res = await metaFetch(cfg, path, { method: 'POST', body: JSON.stringify(body) });
  const j = (await res.json()) as { message_id?: string };
  return { providerMessageId: j.message_id ?? `ig-${Date.now()}`, raw: j };
}

// ---- Media ------------------------------------------------------

async function downloadMedia(
  rawConfig: ChannelConfig,
  providerMediaIdOrUrl: string,
): Promise<DownloadedMedia> {
  const cfg = resolve(rawConfig);
  // Instagram delivers media as direct URLs in the payload — we stored that URL
  // as the providerMediaId.
  if (providerMediaIdOrUrl.startsWith('http')) {
    return metaDownloadByUrl(cfg, providerMediaIdOrUrl);
  }
  throw new Error('Instagram downloadMedia: expected a URL');
}

async function verifyWebhook(req: Request, rawConfig: ChannelConfig): Promise<boolean> {
  const cfg = resolveMetaConfig(rawConfig);
  return verifyMetaSignature(req, cfg);
}

export const InstagramAdapter: ChannelAdapter = {
  type: 'instagram',
  verifyWebhook,
  parseWebhook: (body) => {
    const channelId = (body as { __channelId?: string })?.__channelId ?? '';
    return parseEvent(channelId, body);
  },
  sendMessage,
  downloadMedia,
};
