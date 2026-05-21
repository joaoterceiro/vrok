/**
 * EmailAdapter — IMAP/SMTP via nodemailer + ImapFlow.
 *
 * Esta versão da Fase 3 implementa:
 *   - sendMessage via SMTP (nodemailer)
 *   - parseWebhook como NO-OP (Email não tem webhook; o worker scheduled poll
 *     do IMAP enfileira jobs inbound usando os mesmos formatos).
 *
 * O polling em si vive em `apps/worker/src/jobs/emailPoll.ts`. Esse worker é
 * registrado por scheduled task (cron via BullMQ delay-loop) e empurra eventos
 * para a fila `inbound` no formato Email.
 *
 * Configuração esperada em `channel.config` (campos criptografados):
 *   {
 *     fromAddress: string;
 *     fromName?: string;
 *     smtp: { host, port, secure, user, password };
 *     imap: { host, port, secure, user, password };
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
import { decryptConfig } from '../crypto';

interface EmailConfig extends ChannelConfig {
  fromAddress: string;
  fromName?: string;
  smtp: { host: string; port: number; secure: boolean; user: string; password: string };
  imap: { host: string; port: number; secure: boolean; user: string; password: string };
}

/**
 * Cifra os pares user/password de smtp e imap. Para isso é mais simples ter
 * fields plain no top-level e usar decryptString manualmente. Mantemos a
 * estrutura — guardamos as senhas como strings cifradas que `decryptConfig`
 * detecta pelo prefixo `v1:`.
 */
function resolve(raw: ChannelConfig): EmailConfig {
  // Note: decryptConfig só percorre o nível raiz. Para nested fields fazemos
  // decrypt do password manualmente.
  const cfg = raw as EmailConfig;
  if (!cfg.smtp || !cfg.imap || !cfg.fromAddress) {
    throw new Error('Email: smtp/imap/fromAddress são obrigatórios');
  }
  const out: EmailConfig = {
    ...cfg,
    smtp: { ...cfg.smtp },
    imap: { ...cfg.imap },
  };
  out.smtp = decryptConfig(out.smtp as unknown as Record<string, unknown>, [
    'password',
    'user',
  ] as readonly string[]) as EmailConfig['smtp'];
  out.imap = decryptConfig(out.imap as unknown as Record<string, unknown>, [
    'password',
    'user',
  ] as readonly string[]) as EmailConfig['imap'];
  return out;
}

// ---- Send (SMTP) -----------------------------------------------

async function sendMessage(rawConfig: ChannelConfig, payload: OutboundPayload): Promise<SendResult> {
  const cfg = resolve(rawConfig);
  if (payload.content.type !== 'text' && payload.content.type !== 'media') {
    throw new Error('Email: unsupported content type');
  }

  // nodemailer é uma dep do worker. Dynamic-import para que este módulo
  // continue importável a partir de routes do app (que não enviam direto).
  const { createTransport } = (await import('nodemailer')) as typeof import('nodemailer');
  const transport = createTransport({
    host: cfg.smtp.host,
    port: cfg.smtp.port,
    secure: cfg.smtp.secure,
    auth: { user: cfg.smtp.user, pass: cfg.smtp.password },
  });

  const subject = payload.content.type === 'text'
    ? payload.content.text.split('\n')[0]?.slice(0, 120) ?? 'Mensagem'
    : 'Mensagem com anexo';

  const info = await transport.sendMail({
    from: cfg.fromName ? `${cfg.fromName} <${cfg.fromAddress}>` : cfg.fromAddress,
    to: payload.to,
    subject,
    text: payload.content.type === 'text' ? payload.content.text : (payload.content.caption ?? ''),
    attachments:
      payload.content.type === 'media'
        ? [{ filename: payload.content.filename, path: payload.content.url, contentType: payload.content.mime }]
        : undefined,
  });
  return { providerMessageId: info.messageId ?? `email-${Date.now()}`, raw: info };
}

async function parseWebhook(_body: unknown): Promise<IncomingEvent[]> {
  // No webhook flow — IMAP poll job emits IncomingEvents directly.
  return [];
}

async function downloadMedia(): Promise<DownloadedMedia> {
  return { stream: Readable.from(Buffer.alloc(0)), mime: 'application/octet-stream' };
}

async function verifyWebhook(): Promise<boolean> {
  return true;
}

export const EmailAdapter: ChannelAdapter = {
  type: 'email',
  verifyWebhook,
  parseWebhook: () => [],
  sendMessage,
  downloadMedia,
};

export type { EmailConfig };
export { resolve as resolveEmailConfig };
