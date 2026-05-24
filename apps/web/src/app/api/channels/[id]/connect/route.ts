import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, channels } from '@zora/db';
import {
  evolutionConnect,
  evolutionSetWebhook,
  telegramSetWebhook,
} from '@zora/shared/channels';
import { requireSession } from '@/lib/api/guards';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Channel-type-aware connect:
 *   - wa_evolution: create instance + set webhook + return QR
 *   - telegram: register webhook (per-channel URL)
 *   - wa_cloud / instagram: returns URL+verify token for manual setup on Meta
 *   - webchat: marca connected + retorna snippet de embed
 *   - email: marca connected (IMAP poll roda a cada 2 min)
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  if (session.user.role !== 'admin') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const { id } = await params;

  const [channel] = await db.select().from(channels).where(eq(channels.id, id)).limit(1);
  if (!channel) return NextResponse.json({ error: 'not found' }, { status: 404 });

  await db.update(channels).set({ status: 'connecting' }).where(eq(channels.id, id));

  // For webhook callbacks from other containers (Evolution, Telegram), prefer
  // INTERNAL_APP_URL → falls back to APP_URL → `http://app:3000`. The user-
  // facing browser URL (APP_URL=http://localhost:3000) cannot be reached from
  // inside another Docker service.
  const appUrl = (
    process.env.INTERNAL_APP_URL ??
    process.env.APP_URL ??
    'http://app:3000'
  ).replace(/\/+$/, '');

  // For URLs returned to the BROWSER (Meta App Dashboard, embed scripts),
  // always use the PUBLIC APP_URL — Meta + clients can't reach `http://app:3000`.
  const publicAppUrl = (process.env.APP_URL ?? appUrl).replace(/\/+$/, '');

  try {
    if (channel.type === 'wa_evolution') {
      const webhookUrl = `${appUrl}/api/webhooks/evolution`;
      const { qrCode, pairingCode } = await evolutionConnect(channel.config);
      await evolutionSetWebhook(channel.config, webhookUrl).catch(() => undefined);
      return NextResponse.json({ qrCode, pairingCode });
    }
    if (channel.type === 'telegram') {
      const webhookUrl = `${appUrl}/api/webhooks/telegram/${id}`;
      await telegramSetWebhook(channel.config, webhookUrl);
      await db
        .update(channels)
        .set({ status: 'connected', lastConnectedAt: new Date() })
        .where(eq(channels.id, id));
      return NextResponse.json({ webhookUrl });
    }
    if (channel.type === 'wa_cloud' || channel.type === 'instagram') {
      // Esta URL vai ser cadastrada na Meta App Dashboard — usar URL pública.
      const webhookUrl =
        channel.type === 'wa_cloud'
          ? `${publicAppUrl}/api/webhooks/wa-cloud`
          : `${publicAppUrl}/api/webhooks/instagram`;
      await db
        .update(channels)
        .set({ status: 'connected', lastConnectedAt: new Date() })
        .where(eq(channels.id, id));
      return NextResponse.json({
        manual: true,
        webhookUrl,
        instructions:
          'Configure este URL no Meta App Dashboard apontando para o seu app, usando o verify token cadastrado neste canal.',
      });
    }
    if (channel.type === 'webchat') {
      await db
        .update(channels)
        .set({ status: 'connected', lastConnectedAt: new Date() })
        .where(eq(channels.id, id));
      // URLs públicas — embed roda no browser do visitante final.
      const embedUrl = `${publicAppUrl}/api/widget/${id}/embed.js`;
      const widgetUrl = `${publicAppUrl}/widget/${id}`;
      return NextResponse.json({
        embedSnippet: `<script src="${embedUrl}" defer></script>`,
        widgetUrl,
      });
    }
    if (channel.type === 'email') {
      await db
        .update(channels)
        .set({ status: 'connected', lastConnectedAt: new Date() })
        .where(eq(channels.id, id));
      return NextResponse.json({ ok: true, polling: 'every 120s' });
    }
    return NextResponse.json({ error: 'unsupported channel type' }, { status: 400 });
  } catch (err) {
    await db.update(channels).set({ status: 'error' }).where(eq(channels.id, id));
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
