/**
 * Helpers compartilhados entre os adapters da Meta Graph API (WhatsApp Cloud e
 * Instagram Direct).
 *
 * Configuração esperada (criptografada nos campos sensíveis):
 *   {
 *     accessToken: string;         // Page/business access token
 *     phoneNumberId?: string;      // WA Cloud: ID do número
 *     wabaId?: string;             // WA Cloud: business account ID
 *     igBusinessAccountId?: string;// Instagram: business account ID
 *     verifyToken: string;         // token usado em GET hub.verify_token
 *     appSecret?: string;          // opcional: usado para validar X-Hub-Signature-256
 *     graphVersion?: string;       // default: 'v21.0'
 *   }
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { Readable } from 'node:stream';
import type {
  ChannelConfig,
  DownloadedMedia,
  IncomingEvent,
  OutboundPayload,
  SendResult,
} from '../channel-types';
import { decryptConfig } from '../crypto';

export interface MetaConfig extends ChannelConfig {
  accessToken: string;
  phoneNumberId?: string;
  wabaId?: string;
  igBusinessAccountId?: string;
  verifyToken: string;
  appSecret?: string;
  graphVersion?: string;
}

const META_ENC_FIELDS = ['accessToken', 'verifyToken', 'appSecret'] as const;

export function resolveMetaConfig(raw: ChannelConfig): MetaConfig {
  const decrypted = decryptConfig(raw, META_ENC_FIELDS as readonly (keyof ChannelConfig & string)[]);
  const cfg = decrypted as MetaConfig;
  if (!cfg.accessToken) throw new Error('Meta config: accessToken is required');
  if (!cfg.verifyToken) throw new Error('Meta config: verifyToken is required');
  return cfg;
}

export function graphBase(cfg: MetaConfig): string {
  const v = cfg.graphVersion ?? process.env.META_GRAPH_VERSION ?? 'v21.0';
  return `https://graph.facebook.com/${v}`;
}

export async function metaFetch(cfg: MetaConfig, path: string, init?: RequestInit): Promise<Response> {
  const url = `${graphBase(cfg)}${path}`;
  const headers = new Headers(init?.headers);
  headers.set('Authorization', `Bearer ${cfg.accessToken}`);
  if (init?.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const res = await fetch(url, { ...init, headers });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Meta API ${path} → ${res.status}: ${text.slice(0, 500)}`);
  }
  return res;
}

/**
 * Verifies Meta's `X-Hub-Signature-256` header against the raw body using
 * appSecret. If appSecret isn't configured we fallback to allowing the
 * request through (development-friendly).
 *
 * `hub.challenge` (GET handshake) is handled in the route, not here.
 */
export async function verifyMetaSignature(req: Request, cfg: MetaConfig): Promise<boolean> {
  if (!cfg.appSecret) {
    // Production must enforce. Dev-friendly: allow with a warning.
    if (process.env.WEBHOOK_ENFORCE_SIGNATURE === 'true') return false;
    // eslint-disable-next-line no-console
    console.warn(
      '[verifyMetaSignature] channel has no appSecret; allowing webhook. Set appSecret on the channel and WEBHOOK_ENFORCE_SIGNATURE=true in production.',
    );
    return true;
  }
  const sig = req.headers.get('x-hub-signature-256') ?? '';
  if (!sig.startsWith('sha256=')) return false;
  const body = await req.clone().text();
  const mac = createHmac('sha256', cfg.appSecret).update(body).digest();
  const sent = Buffer.from(sig.slice(7), 'hex');
  if (sent.length !== mac.length) return false;
  return timingSafeEqual(sent, mac);
}

/** Used by media adapter helpers — downloads a binary at a Graph media URL. */
export async function metaDownloadByUrl(cfg: MetaConfig, mediaUrl: string): Promise<DownloadedMedia> {
  const res = await fetch(mediaUrl, {
    headers: { Authorization: `Bearer ${cfg.accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`Meta media fetch failed: ${res.status}`);
  }
  const mime = res.headers.get('content-type') ?? 'application/octet-stream';
  const buf = Buffer.from(await res.arrayBuffer());
  return {
    stream: Readable.from(buf),
    mime,
    size: buf.byteLength,
  };
}

/** Resolves a media id to its CDN URL via the Graph API. */
export async function metaResolveMediaUrl(cfg: MetaConfig, mediaId: string): Promise<string> {
  const res = await metaFetch(cfg, `/${encodeURIComponent(mediaId)}`);
  const body = (await res.json()) as { url?: string };
  if (!body.url) throw new Error('Meta resolveMediaUrl: empty url');
  return body.url;
}

// Re-export helpers needed by the adapters.
export type { ChannelConfig, DownloadedMedia, IncomingEvent, OutboundPayload, SendResult };
