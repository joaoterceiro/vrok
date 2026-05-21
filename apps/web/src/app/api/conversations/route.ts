import { NextResponse, type NextRequest } from 'next/server';
import { and, desc, eq, inArray, isNull, or, sql, type SQL } from 'drizzle-orm';
import { db, conversations, contacts, channels, teamMembers } from '@zora/db';
import { requireSession } from '@/lib/api/guards';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Filter = 'mine' | 'unassigned' | 'team' | 'resolved' | 'all';
const FILTERS: ReadonlySet<Filter> = new Set(['mine', 'unassigned', 'team', 'resolved', 'all']);

export async function GET(req: NextRequest) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const userId = session.user.id;

  const url = new URL(req.url);
  const filterParam = (url.searchParams.get('filter') ?? 'all') as Filter;
  const filter: Filter = FILTERS.has(filterParam) ? filterParam : 'all';
  const search = url.searchParams.get('q')?.trim() ?? '';

  const where: SQL[] = [];

  if (filter === 'resolved') {
    where.push(eq(conversations.status, 'resolved'));
  } else if (filter !== 'all') {
    where.push(sql`${conversations.status} IN ('open','pending','snoozed')`);
  }

  if (filter === 'mine') {
    where.push(eq(conversations.assigneeId, userId));
  } else if (filter === 'unassigned') {
    where.push(isNull(conversations.assigneeId));
  } else if (filter === 'team') {
    const teamIds = await db
      .select({ id: teamMembers.teamId })
      .from(teamMembers)
      .where(eq(teamMembers.userId, userId));
    const ids = teamIds.map((t) => t.id);
    if (ids.length === 0) {
      return NextResponse.json({ conversations: [] });
    }
    where.push(inArray(conversations.teamId, ids));
  }

  if (search) {
    const like = `%${search.replace(/[%_]/g, '')}%`;
    const orClause = or(
      sql`${contacts.name} ILIKE ${like}`,
      sql`${conversations.lastMessagePreview} ILIKE ${like}`,
      sql`${contacts.phone} ILIKE ${like}`,
    );
    if (orClause) where.push(orClause);
  }

  const rows = await db
    .select({
      id: conversations.id,
      status: conversations.status,
      priority: conversations.priority,
      teamId: conversations.teamId,
      assigneeId: conversations.assigneeId,
      unreadCount: conversations.unreadCount,
      lastMessageAt: conversations.lastMessageAt,
      lastMessagePreview: conversations.lastMessagePreview,
      slaDueAt: conversations.slaDueAt,
      contact: {
        id: contacts.id,
        name: contacts.name,
        avatarUrl: contacts.avatarUrl,
        phone: contacts.phone,
        email: contacts.email,
      },
      channel: { id: channels.id, type: channels.type, name: channels.name },
    })
    .from(conversations)
    .innerJoin(contacts, eq(contacts.id, conversations.contactId))
    .innerJoin(channels, eq(channels.id, conversations.channelId))
    .where(where.length > 0 ? and(...where) : sql`true`)
    .orderBy(desc(sql`COALESCE(${conversations.lastMessageAt}, ${conversations.createdAt})`))
    .limit(200);

  return NextResponse.json({ conversations: rows });
}
