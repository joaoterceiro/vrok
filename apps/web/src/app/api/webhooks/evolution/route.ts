import { NextResponse, type NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, channels } from '@zora/db';
import { getAdapter } from '@zora/shared/channels';
import { queues } from '@/lib/queues';
import { redis } from '@/lib/redis';
import { REDIS_CHANNELS, SOCKET_ROOMS } from '@zora/shared';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type EvoState = 'open' | 'close' | 'connecting' | string;
const STATE_MAP: Record<EvoState, 'connected' | 'disconnected' | 'connecting'> = {
  open: 'connected',
  close: 'disconnected',
  connecting: 'connecting',
};

function eventKey(body: unknown): string {
  if (typeof body !== 'object' || body === null) return '';
  // Evolution sends "event" as a slash-separated path: "connection.update",
  // "messages.upsert", "qrcode.updated", etc.
  return String((body as { event?: string }).event ?? '').toLowerCase();
}

/**
 * Evolution webhook receiver. Thin: parse → enqueue inbound job → 200.
 *
 * Channel identification: Evolution payload carries `instance` (the instance
 * name). We look up the matching channel by `config.instanceName`.
 */
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const instanceName = (body as { instance?: string })?.instance;
  if (!instanceName) {
    return NextResponse.json({ ok: true, reason: 'missing instance' });
  }

  const matching = await db
    .select()
    .from(channels)
    .where(eq(channels.type, 'wa_evolution'));
  const channel = matching.find(
    (c) => ((c.config as { instanceName?: string })?.instanceName ?? '') === instanceName,
  );

  if (!channel) {
    return NextResponse.json({ ok: true, reason: 'no matching channel' });
  }

  // Verify webhook auth (optional token).
  const adapter = getAdapter('wa_evolution');
  const ok = await adapter.verifyWebhook(req as unknown as Request, channel.config);
  if (!ok) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // Connection state events are handled inline (not via worker) so the UI
  // sees the channel flip to "Conectado" the moment Baileys pairs.
  const ev = eventKey(body);
  if (ev === 'connection.update' || ev === 'connection_update') {
    const data = (body as { data?: { state?: string } }).data;
    const next = STATE_MAP[(data?.state ?? '') as EvoState];
    if (next) {
      const wasConnected = channel.status === 'connected';
      await db
        .update(channels)
        .set({
          status: next,
          lastConnectedAt: next === 'connected' ? new Date() : channel.lastConnectedAt,
          updatedAt: new Date(),
        })
        .where(eq(channels.id, channel.id));

      // Broadcast so the Channels page reflects instantly (TanStack still
      // polls every 10s, but the socket nudge avoids the wait).
      await redis.publish(
        REDIS_CHANNELS.socketBroadcast,
        JSON.stringify({
          room: SOCKET_ROOMS.all,
          event: 'channel:status',
          data: { channelId: channel.id, status: next },
        }),
      );

      // Auto-trigger history-sync the FIRST time the instance reaches `open`.
      // `syncStatus === 'idle'` guards against re-imports on re-pairing.
      if (
        next === 'connected' &&
        !wasConnected &&
        (channel.syncStatus ?? 'idle') === 'idle'
      ) {
        await db
          .update(channels)
          .set({ syncStatus: 'queued' })
          .where(eq(channels.id, channel.id));
        await queues.historySync.add(
          'sync',
          { channelId: channel.id },
          {
            jobId: `history-sync-${channel.id}`, // BullMQ rejects ':' in job IDs
            removeOnComplete: { count: 5 },
          },
        );
      }
    }
    return NextResponse.json({ ok: true, handled: 'connection.update', status: next });
  }

  // Everything else (messages.upsert, messages.update, etc.) goes through
  // the inbound worker.
  await queues.inbound.add(
    'evolution',
    { channelId: channel.id, payload: body },
    {
      attempts: 5,
      backoff: { type: 'exponential', delay: 1500 },
      removeOnComplete: 1000,
      removeOnFail: false,
    },
  );

  return NextResponse.json({ ok: true });
}

export async function GET() {
  // Health probe for the webhook URL.
  return NextResponse.json({ ok: true, channel: 'wa_evolution' });
}
