import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/public-config — endpoint PÚBLICO com config "segura" pro browser.
 *
 * Necessário porque vars NEXT_PUBLIC_* são build-time (inlined no JS).
 * Vrok roda imagem buildada pelo CI, então NEXT_PUBLIC_ vira undefined.
 * Este endpoint lê as envs SERVER-SIDE em runtime e expõe só o que é
 * seguro publicar (IDs públicos, nunca secrets).
 *
 * Cache: 5 min no edge — mudou env? clica Implantar pra reiniciar containers.
 */
export async function GET() {
  return NextResponse.json(
    {
      whatsapp: {
        appId: process.env.WHATSAPP_APP_ID ?? null,
        configurationId: process.env.WHATSAPP_CONFIGURATION_ID ?? null,
        cloudApiEnabled: process.env.WHATSAPP_CLOUD_API_ENABLED === 'true',
      },
      hcaptcha: {
        siteKey: process.env.HCAPTCHA_SITEKEY ?? null,
      },
      app: {
        url: process.env.APP_URL ?? null,
      },
    },
    {
      headers: {
        'Cache-Control': 'public, max-age=300',
      },
    },
  );
}
