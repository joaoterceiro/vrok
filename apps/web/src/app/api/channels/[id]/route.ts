import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import {
  db,
  channels,
  conversations,
  agentAssignments,
} from '@zora/db';
import { evolutionDeleteInstance } from '@zora/shared/channels';
import { requireSession } from '@/lib/api/guards';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  if (session.user.role !== 'admin') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const { id } = await params;

  const [channel] = await db.select().from(channels).where(eq(channels.id, id)).limit(1);
  if (!channel) return NextResponse.json({ error: 'not found' }, { status: 404 });

  // Best-effort: logout + delete the instance on the Evolution server so it
  // doesn't keep a dangling Baileys session. Errors are swallowed — the local
  // row is always removed even if the upstream server is unreachable.
  if (channel.type === 'wa_evolution') {
    await evolutionDeleteInstance(channel.config).catch(() => undefined);
  }

  // `channels.id` is referenced with ON DELETE RESTRICT from `conversations`
  // (intentionally — we don't want a stray DELETE to nuke history). To
  // actually remove a channel we drop its dependents explicitly first.
  // Messages + attachments cascade from conversations, so deleting the
  // conversation rows is enough to clean those up.
  await db.delete(agentAssignments).where(eq(agentAssignments.channelId, id));
  await db.delete(conversations).where(eq(conversations.channelId, id));
  await db.delete(channels).where(eq(channels.id, id));
  return NextResponse.json({ ok: true });
}
