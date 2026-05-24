import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db, channels, events } from '@zora/db';
import { eq } from 'drizzle-orm';
import { requireSession } from '@/lib/api/guards';
import { encryptConfig } from '@zora/shared/crypto';
import {
  exchangeCodeForToken,
  debugToken,
  extractWabaIds,
  listPhoneNumbers,
  subscribeAppToWaba,
  generateVerifyToken,
} from '@/lib/whatsapp-embedded';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const schema = z.object({
  code: z.string().min(10),
  /** WABA opcionalmente já selecionada pelo usuário no popup. */
  wabaId: z.string().optional(),
  /** Phone Number ID opcional — se não informado, pega o primeiro da WBA. */
  phoneNumberId: z.string().optional(),
  /** Nome amigável do canal no Vrok. */
  name: z.string().min(2).max(120).default('WhatsApp · Cloud (Meta)'),
});

/**
 * POST /api/channels/whatsapp/embedded-signup
 *
 * Recebe `code` do popup FB.login (Embedded Signup) + dados opcionais,
 * faz token exchange, subscribe do app na WBA e cria o channel no DB.
 *
 * Admin apenas.
 */
export async function POST(req: Request) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  if (session.user.role !== 'admin') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_body', issues: parsed.error.issues }, { status: 400 });
  }
  const input = parsed.data;

  try {
    // 1. Code → access_token
    const tok = await exchangeCodeForToken(input.code);

    // 2. Debug do token pra extrair WABAs autorizadas
    const dbg = await debugToken(tok.access_token);
    const wabaIds = extractWabaIds(dbg);
    if (wabaIds.length === 0) {
      return NextResponse.json(
        { error: 'no_waba_granted', detail: 'O token não inclui acesso a nenhuma WABA' },
        { status: 400 },
      );
    }

    const wabaId = input.wabaId && wabaIds.includes(input.wabaId) ? input.wabaId : wabaIds[0];

    // 3. Lista phone numbers e escolhe o primeiro (ou o informado)
    const phones = await listPhoneNumbers(wabaId, tok.access_token);
    if (phones.length === 0) {
      return NextResponse.json(
        { error: 'no_phone_numbers', detail: 'A WBA não tem números cadastrados' },
        { status: 400 },
      );
    }
    const phone = input.phoneNumberId
      ? phones.find((p) => p.id === input.phoneNumberId) ?? phones[0]
      : phones[0];

    // 4. Subscribe do app na WBA (necessário pra webhooks + gestão de templates)
    await subscribeAppToWaba(wabaId, tok.access_token);

    // 5. Cria channel no DB com config criptografado
    const verifyToken = generateVerifyToken();
    const rawConfig = {
      phoneNumberId: phone.id,
      wabaId,
      accessToken: tok.access_token,
      verifyToken,
      appSecret: process.env.WHATSAPP_APP_SECRET ?? '',
      displayPhoneNumber: phone.display_phone_number,
      verifiedName: phone.verified_name,
    };
    const encrypted = encryptConfig(rawConfig, [
      'phoneNumberId',
      'wabaId',
      'accessToken',
      'verifyToken',
      'appSecret',
    ]);

    // Procura canal existente com mesmo phoneNumberId pra evitar duplicata
    const allWa = await db.select().from(channels).where(eq(channels.type, 'wa_cloud'));
    const existing = allWa.find((c) => {
      const cfg = c.config as Record<string, unknown>;
      return cfg.phoneNumberId === phone.id || cfg.phoneNumberId === rawConfig.phoneNumberId;
    });

    let channelId: string;
    if (existing) {
      await db
        .update(channels)
        .set({ config: encrypted, status: 'connected', updatedAt: new Date() })
        .where(eq(channels.id, existing.id));
      channelId = existing.id;
    } else {
      const [created] = await db
        .insert(channels)
        .values({
          type: 'wa_cloud',
          name: input.name,
          config: encrypted,
          status: 'connected',
        })
        .returning();
      channelId = created.id;
    }

    // 6. Audit
    await db.insert(events).values({
      type: 'channel_embedded_signup',
      actorType: 'user',
      actorId: session.user.id,
      payload: {
        channelId,
        wabaId,
        phoneNumberId: phone.id,
        displayPhoneNumber: phone.display_phone_number,
        verifiedName: phone.verified_name,
        at: new Date().toISOString(),
      },
    });

    return NextResponse.json({
      ok: true,
      channelId,
      wabaId,
      phoneNumberId: phone.id,
      displayPhoneNumber: phone.display_phone_number,
      verifiedName: phone.verified_name,
      webhookUrl: `${process.env.APP_URL}/api/webhooks/wa-cloud`,
      verifyToken,
      message:
        'Canal conectado com sucesso. Configure o webhook na Meta App com a URL e Verify Token retornados acima.',
    });
  } catch (err) {
    const msg = (err as Error).message;
    console.error('[embedded-signup]', msg);
    return NextResponse.json({ error: 'signup_failed', detail: msg }, { status: 500 });
  }
}
