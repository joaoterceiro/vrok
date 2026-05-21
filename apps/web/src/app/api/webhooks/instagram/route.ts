import { NextResponse, type NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, channels } from '@zora/db';
import { getAdapter, handleMetaSubscribe } from '@zora/shared/channels';
import { queues } from '@/lib/queues';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const rows = await db.select().from(channels).where(eq(channels.type, 'instagram'));
  for (const c of rows) {
    const r = handleMetaSubscribe(url, c.config);
    if (r.ok) return new Response(r.challenge, { status: 200 });
  }
  return NextResponse.json({ error: 'unauthorized' }, { status: 403 });
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.clone().json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const igRecipientId = extractRecipient(body);
  if (!igRecipientId) return NextResponse.json({ ok: true, reason: 'no recipient' });

  const rows = await db.select().from(channels).where(eq(channels.type, 'instagram'));
  const channel = rows.find(
    (c) =>
      ((c.config as { igBusinessAccountId?: string })?.igBusinessAccountId ?? '') === igRecipientId,
  );
  if (!channel) return NextResponse.json({ ok: true, reason: 'no matching channel' });

  const adapter = getAdapter('instagram');
  const ok = await adapter.verifyWebhook(req as unknown as Request, channel.config);
  if (!ok) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  await queues.inbound.add(
    'instagram',
    { channelId: channel.id, payload: body },
    { attempts: 5, backoff: { type: 'exponential', delay: 1500 }, removeOnComplete: 1000 },
  );
  return NextResponse.json({ ok: true });
}

function extractRecipient(body: unknown): string | null {
  const root = body as { entry?: Array<{ messaging?: Array<{ recipient?: { id?: string } }> }> };
  for (const entry of root?.entry ?? []) {
    for (const m of entry.messaging ?? []) {
      const id = m.recipient?.id;
      if (id) return id;
    }
  }
  return null;
}
