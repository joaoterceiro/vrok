/**
 * WebchatAdapter — canal próprio. As mensagens chegam de um widget embutível
 * (`/widget/[channelId]`) via POST autenticado por um cookie de visitante e
 * são entregues de volta para o widget via Socket.IO + GET poll.
 *
 * Não há "send" no sentido tradicional: o adapter.sendMessage pode chamar uma
 * função de delivery, mas a UI do widget faz subscribe direto no Socket.IO
 * room `webchat:<channelId>:<visitorId>` que o app já publica.
 *
 * Configuração esperada em `channel.config`:
 *   {
 *     widgetTheme?: { primary?: string; greeting?: string };
 *   }
 */
import { Readable } from 'node:stream';
import type {
  ChannelAdapter,
  ChannelConfig,
  DownloadedMedia,
  IncomingEvent,
  OutboundPayload,
  SendResult,
} from '../channel-types';

interface WebchatConfig extends ChannelConfig {
  widgetTheme?: { primary?: string; greeting?: string };
}

interface WebchatIncomingBody {
  visitorId: string;
  name?: string;
  email?: string;
  text?: string;
  attachment?: { url: string; mime: string; mediaType: 'image' | 'audio' | 'video' | 'document'; filename?: string };
  __channelId?: string;
}

function parseEvent(channelId: string, body: unknown): IncomingEvent[] {
  const b = body as WebchatIncomingBody | null;
  if (!b || !b.visitorId) return [];
  const ts = new Date();
  const id = `wc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  let content: IncomingEvent['content'] | null = null;
  if (b.text && b.text.trim()) {
    content = { type: 'text', text: b.text.trim() };
  } else if (b.attachment) {
    content = {
      type: 'media',
      mediaType: b.attachment.mediaType,
      providerMediaId: b.attachment.url,
      mime: b.attachment.mime,
      filename: b.attachment.filename,
    };
  }
  if (!content) return [];

  return [
    {
      channelId,
      providerMessageId: id,
      externalContactId: b.visitorId,
      contactProfile: b.name || b.email ? { name: b.name, email: b.email } : undefined,
      timestamp: ts,
      content,
      raw: b,
    },
  ];
}

/**
 * For webchat the "send" simply means: we already wrote the outbound message to
 * the DB; the widget will receive it via the Socket.IO event we publish from
 * the outbound worker (room: `webchat:<channelId>:<visitorId>`).
 *
 * We still return a synthetic provider id so the message can be tracked.
 */
async function sendMessage(_cfg: ChannelConfig, payload: OutboundPayload): Promise<SendResult> {
  return {
    providerMessageId: `wc-out-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    raw: payload,
  };
}

async function downloadMedia(): Promise<DownloadedMedia> {
  // Webchat media lives in our own MinIO via /api/media/[key] — never downloaded
  // through this adapter path.
  return { stream: Readable.from(Buffer.alloc(0)), mime: 'application/octet-stream' };
}

async function verifyWebhook(): Promise<boolean> {
  // The widget route already authenticates the visitor via signed cookie.
  return true;
}

export const WebchatAdapter: ChannelAdapter = {
  type: 'webchat',
  verifyWebhook,
  parseWebhook: (body) => {
    const channelId = (body as { __channelId?: string })?.__channelId ?? '';
    return parseEvent(channelId, body);
  },
  sendMessage,
  downloadMedia,
};

export function getWebchatTheme(config: ChannelConfig): { primary: string; greeting: string } {
  const cfg = config as WebchatConfig;
  return {
    primary: cfg.widgetTheme?.primary ?? '#fa4374',
    greeting: cfg.widgetTheme?.greeting ?? 'Olá! Como podemos ajudar?',
  };
}
