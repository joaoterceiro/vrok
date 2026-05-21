import { NextResponse, type NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, channels } from '@zora/db';
import { queues } from '@/lib/queues';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Public endpoint used by the embeddable widget. Visitors are identified by
 * a `visitorId` string they generate and persist in localStorage. The widget
 * route doesn't require auth — the trust boundary is the channel id itself
 * (which is a UUID and is the public token).
 */
const bodySchema = z.object({
  visitorId: z.string().min(8).max(64),
  name: z.string().max(120).optional(),
  email: z.string().email().optional(),
  text: z.string().max(4000).optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ channelId: string }> }) {
  const { channelId } = await params;
  const [channel] = await db
    .select()
    .from(channels)
    .where(eq(channels.id, channelId))
    .limit(1);
  if (!channel || channel.type !== 'webchat') {
    return NextResponse.json({ error: 'channel not found' }, { status: 404 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }

  await queues.inbound.add(
    'webchat',
    { channelId, payload: parsed.data },
    { attempts: 5, backoff: { type: 'exponential', delay: 1500 }, removeOnComplete: 1000 },
  );
  return NextResponse.json({ ok: true });
}
