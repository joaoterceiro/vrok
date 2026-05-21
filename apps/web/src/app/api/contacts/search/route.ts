import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { db, contacts } from '@zora/db';
import { requireSession } from '@/lib/api/guards';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/contacts/search?q=...&exclude=... — typeahead for the merge
 * picker. Excludes one specific contact id (the current contact).
 */
export async function GET(req: Request) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  const url = new URL(req.url);
  const q = (url.searchParams.get('q') ?? '').trim();
  const exclude = url.searchParams.get('exclude');
  if (!q) return NextResponse.json({ contacts: [] });

  const like = `%${q}%`;
  const rows = await db
    .select({
      id: contacts.id,
      name: contacts.name,
      phone: contacts.phone,
      email: contacts.email,
      avatarUrl: contacts.avatarUrl,
    })
    .from(contacts)
    .where(
      exclude
        ? sql`(
            ${contacts.name} ILIKE ${like}
            OR ${contacts.phone} ILIKE ${like}
            OR ${contacts.email} ILIKE ${like}
          ) AND ${contacts.id} != ${exclude}`
        : sql`(
            ${contacts.name} ILIKE ${like}
            OR ${contacts.phone} ILIKE ${like}
            OR ${contacts.email} ILIKE ${like}
          )`,
    )
    .limit(10);

  return NextResponse.json({ contacts: rows });
}
