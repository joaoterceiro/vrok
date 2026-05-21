import { NextResponse, type NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, channels } from '@zora/db';
import { getAdapter } from '@zora/shared/channels';
import { queues } from '@/lib/queues';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Telegram sends to a URL we register per-bot. We embed the channel id in the
 * URL itself so we don't have to disambiguate by payload contents.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ channelId: string }> }) {
  const { channelId } = await params;
  const [channel] = await db.select().from(channels).where(eq(channels.id, channelId)).limit(1);
  if (!channel || channel.type !== 'telegram') {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  const adapter = getAdapter('telegram');
  const ok = await adapter.verifyWebhook(req as unknown as Request, channel.config);
  if (!ok) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  await queues.inbound.add(
    'telegram',
    { channelId, payload: body },
    { attempts: 5, backoff: { type: 'exponential', delay: 1500 }, removeOnComplete: 1000 },
  );
  return NextResponse.json({ ok: true });
}
