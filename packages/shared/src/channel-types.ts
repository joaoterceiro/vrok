import type { Readable } from 'node:stream';

export type ChannelType =
  | 'wa_evolution'
  | 'wa_cloud'
  | 'instagram'
  | 'telegram'
  | 'webchat'
  | 'email';

export type ChannelConfig = Record<string, unknown>;

export type MediaType = 'image' | 'audio' | 'video' | 'document' | 'sticker';

export type IncomingContent =
  | { type: 'text'; text: string }
  | {
      type: 'media';
      mediaType: MediaType;
      providerMediaId: string;
      caption?: string;
      mime?: string;
      filename?: string;
    }
  | { type: 'location'; lat: number; lng: number; name?: string; address?: string }
  | {
      type: 'status';
      messageId: string;
      status: 'sent' | 'delivered' | 'read' | 'failed';
      error?: string;
    }
  | { type: 'reaction'; messageId: string; emoji: string };

export interface IncomingEvent {
  channelId: string;
  providerMessageId: string;
  externalContactId: string;
  contactProfile?: { name?: string; avatar?: string; phone?: string; email?: string };
  timestamp: Date;
  content: IncomingContent;
  raw?: unknown;
}

export type OutboundContent =
  | { type: 'text'; text: string }
  | {
      type: 'media';
      mediaType: MediaType;
      url: string;
      caption?: string;
      mime?: string;
      filename?: string;
    }
  | {
      type: 'template';
      templateProviderId: string;
      language: string;
      components: Array<{ type: string; parameters: unknown[] }>;
    };

export interface OutboundPayload {
  to: string;
  content: OutboundContent;
  /** Optional client-side correlation id (for idempotency / status linkback). */
  clientRef?: string;
}

export interface SendResult {
  providerMessageId: string;
  raw?: unknown;
}

export interface DownloadedMedia {
  stream: Readable;
  mime: string;
  size?: number;
  filename?: string;
}

export interface ChannelAdapter {
  readonly type: ChannelType;
  verifyWebhook(req: Request, config: ChannelConfig): Promise<boolean>;
  parseWebhook(body: unknown, config: ChannelConfig): IncomingEvent[];
  sendMessage(config: ChannelConfig, payload: OutboundPayload): Promise<SendResult>;
  downloadMedia(config: ChannelConfig, providerMediaId: string): Promise<DownloadedMedia>;
  markAsRead?(config: ChannelConfig, providerMessageId: string): Promise<void>;
}
