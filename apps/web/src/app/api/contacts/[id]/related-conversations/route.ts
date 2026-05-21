import { NextResponse, type NextRequest } from 'next/server';
import { and, desc, eq, ne } from 'drizzle-orm';
import { db, conversations, channels } from '@zora/db';
import { requireSession } from '@/lib/api/guards';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/contacts/:id/related-conversations?exclude=<conversationId>
 *
 * Lists the other conversations this contact has had — across all channels.
 * Used by the right-side panel ("conversas anteriores", "outras conversas
 * abertas em outros canais"). Excludes the conversation the operator is
 * currently looking at when `exclude` is provided.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const { id } = await params;
  const url = new URL(req.url);
  const exclude = url.searchParams.get('exclude');

  const filters = [eq(conversations.contactId, id)];
  if (exclude) filters.push(ne(conversations.id, exclude));

  const rows = await db
    .select({
      id: conversations.id,
      status: conversations.status,
      priority: conversations.priority,
      lastMessageAt: conversations.lastMessageAt,
      lastMessagePreview: conversations.lastMessagePreview,
      createdAt: conversations.createdAt,
      resolvedAt: conversations.resolvedAt,
      channel: { id: channels.id, type: channels.type, name: channels.name },
    })
    .from(conversations)
    .innerJoin(channels, eq(channels.id, conversations.channelId))
    .where(and(...filters))
    .orderBy(desc(conversations.lastMessageAt))
    .limit(40);

  const openInOtherChannels = rows.filter((r) => r.status === 'open' || r.status === 'pending').length;

  return NextResponse.json({
    total: rows.length,
    openInOtherChannels,
    conversations: rows,
  });
}
