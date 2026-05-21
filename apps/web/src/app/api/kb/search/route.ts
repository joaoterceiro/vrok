import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/api/guards';
import { kbSearch } from '@/lib/kb-search';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/kb/search?q=...&limit=5 — used by the right-panel KB widget
 * and (optionally) the agent worker. Returns ranked hits with snippets.
 */
export async function GET(req: Request) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  const url = new URL(req.url);
  const q = url.searchParams.get('q') ?? '';
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 5), 20);

  const hits = await kbSearch(q, limit);
  return NextResponse.json({ hits, query: q });
}
