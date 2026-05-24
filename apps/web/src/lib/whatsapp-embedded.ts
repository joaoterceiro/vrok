/**
 * Helpers para WhatsApp Embedded Signup (Tech Provider App da Meta).
 *
 * Fluxo:
 *   1. Frontend abre popup via FB.login com config_id
 *   2. Usuário autoriza → recebemos `code` short-lived
 *   3. Backend troca code por access_token longo via /oauth/access_token
 *   4. Backend obtém WABA + Phone Number IDs via /debug_token e /me/businesses
 *   5. Backend faz subscribe do app na WBA
 *   6. Backend grava channel no DB
 *
 * Docs: https://developers.facebook.com/docs/whatsapp/embedded-signup
 */

const GRAPH = 'https://graph.facebook.com/v22.0';

export interface TokenExchangeResult {
  access_token: string;
  token_type: 'bearer';
  expires_in?: number;
}

export interface DebugTokenResult {
  app_id: string;
  scopes: string[];
  granular_scopes?: Array<{ scope: string; target_ids?: string[] }>;
  user_id?: string;
}

/**
 * Step 3 — troca o `code` curto retornado pelo popup por um access_token
 * de longa duração (60 dias). Para tornar permanente, usa System User token.
 */
export async function exchangeCodeForToken(code: string): Promise<TokenExchangeResult> {
  const appId = process.env.WHATSAPP_APP_ID;
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appId || !appSecret) {
    throw new Error('WHATSAPP_APP_ID and WHATSAPP_APP_SECRET must be set');
  }
  const url = new URL(`${GRAPH}/oauth/access_token`);
  url.searchParams.set('client_id', appId);
  url.searchParams.set('client_secret', appSecret);
  url.searchParams.set('code', code);
  const r = await fetch(url.toString());
  const data = (await r.json()) as TokenExchangeResult & { error?: { message: string } };
  if (!r.ok || !data.access_token) {
    throw new Error(`token exchange failed: ${data.error?.message ?? r.status}`);
  }
  return data;
}

/** Step 4 — debug do token retorna scopes + granular_scopes (WABA IDs autorizadas). */
export async function debugToken(token: string): Promise<DebugTokenResult> {
  const appToken = `${process.env.WHATSAPP_APP_ID}|${process.env.WHATSAPP_APP_SECRET}`;
  const r = await fetch(
    `${GRAPH}/debug_token?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(appToken)}`,
  );
  const data = (await r.json()) as { data: DebugTokenResult; error?: { message: string } };
  if (!r.ok || !data.data) {
    throw new Error(`debug_token failed: ${data.error?.message ?? r.status}`);
  }
  return data.data;
}

/** Step 4b — extrai WABA IDs autorizadas dos granular_scopes do token. */
export function extractWabaIds(debug: DebugTokenResult): string[] {
  const scope = debug.granular_scopes?.find((s) => s.scope === 'whatsapp_business_management');
  return scope?.target_ids ?? [];
}

/** Lista phone numbers de uma WBA. */
export async function listPhoneNumbers(
  wabaId: string,
  token: string,
): Promise<Array<{ id: string; display_phone_number: string; verified_name: string }>> {
  const r = await fetch(`${GRAPH}/${wabaId}/phone_numbers?fields=id,display_phone_number,verified_name`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = (await r.json()) as { data?: Array<{ id: string; display_phone_number: string; verified_name: string }>; error?: { message: string } };
  if (!r.ok) throw new Error(`listPhoneNumbers failed: ${data.error?.message ?? r.status}`);
  return data.data ?? [];
}

/** Step 5 — subscribe do app na WBA. Sem isso, webhooks não chegam. */
export async function subscribeAppToWaba(wabaId: string, token: string): Promise<void> {
  const r = await fetch(`${GRAPH}/${wabaId}/subscribed_apps`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) {
    const data = (await r.json()) as { error?: { message: string } };
    throw new Error(`subscribeApp failed: ${data.error?.message ?? r.status}`);
  }
}

/** Gera Verify Token aleatório (UUID v4 sem hifens) para o webhook handshake. */
export function generateVerifyToken(): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { randomBytes } = require('node:crypto') as typeof import('node:crypto');
  return randomBytes(24).toString('hex');
}
