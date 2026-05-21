/**
 * Minimal transactional email helper. Uses SMTP via Nodemailer when
 * SMTP_HOST is set, otherwise logs the message to stdout (dev mode) so
 * the invite/reset link is recoverable from the container logs.
 *
 * Keep zero external deps so the install footprint doesn't grow: when
 * Nodemailer isn't available the function falls back to logging.
 */

interface SendOptions {
  to: string;
  subject: string;
  /** Plain-text body. HTML rendering is not required for invite/reset. */
  text: string;
}

interface SendResult {
  delivered: 'smtp' | 'console';
  preview?: string;
}

let transporterPromise: Promise<unknown> | null = null;

async function getTransporter() {
  if (!process.env.SMTP_HOST) return null;
  if (!transporterPromise) {
    transporterPromise = (async () => {
      try {
        const nm = (await import('nodemailer')) as unknown as {
          createTransport: (opts: Record<string, unknown>) => unknown;
        };
        return nm.createTransport({
          host: process.env.SMTP_HOST,
          port: Number(process.env.SMTP_PORT ?? 587),
          secure: process.env.SMTP_SECURE === 'true',
          auth:
            process.env.SMTP_USER && process.env.SMTP_PASS
              ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
              : undefined,
        });
      } catch {
        // nodemailer not installed — caller will fall back to console.
        return null;
      }
    })();
  }
  return transporterPromise;
}

export async function sendEmail(opts: SendOptions): Promise<SendResult> {
  const transporter = (await getTransporter()) as
    | { sendMail: (m: Record<string, unknown>) => Promise<unknown> }
    | null;

  if (transporter) {
    await transporter.sendMail({
      from: process.env.SMTP_FROM ?? 'no-reply@vrok.local',
      to: opts.to,
      subject: opts.subject,
      text: opts.text,
    });
    return { delivered: 'smtp' };
  }

  // Dev fallback — log so the link can be copied from container logs.
  console.log('\n[email] (no SMTP_HOST set — dev fallback)');
  console.log(`  to: ${opts.to}`);
  console.log(`  subject: ${opts.subject}`);
  console.log(`  body:\n${opts.text.replace(/^/gm, '    ')}\n`);
  return { delivered: 'console', preview: opts.text };
}
