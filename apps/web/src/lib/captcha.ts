/**
 * hCaptcha verification. Skipped quando HCAPTCHA_SECRET não está setado
 * (modo dev). Em produção, configure:
 *
 *   HCAPTCHA_SECRET=0x0000...
 *   NEXT_PUBLIC_HCAPTCHA_SITEKEY=abcd1234-...   (para o front)
 *
 * Site: https://www.hcaptcha.com — gratuito até 1M/mês.
 */
export interface CaptchaResult {
  ok: boolean;
  error?: string;
}

const HCAPTCHA_URL = 'https://hcaptcha.com/siteverify';

export async function verifyCaptcha(token: string, ip?: string): Promise<CaptchaResult> {
  const secret = process.env.HCAPTCHA_SECRET;
  if (!secret) {
    // Dev mode — pula verificação.
    return { ok: true };
  }
  if (!token || token === 'skip') {
    return { ok: false, error: 'missing_token' };
  }
  try {
    const body = new URLSearchParams({ secret, response: token });
    if (ip) body.append('remoteip', ip);
    const r = await fetch(HCAPTCHA_URL, {
      method: 'POST',
      body,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    const data = (await r.json()) as { success?: boolean; 'error-codes'?: string[] };
    if (!data.success) {
      return { ok: false, error: data['error-codes']?.join(',') ?? 'invalid' };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
