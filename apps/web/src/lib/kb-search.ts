import { sql } from 'drizzle-orm';
import { db, kbArticles } from '@zora/db';

export interface KbSearchHit {
  id: string;
  title: string;
  summary: string | null;
  snippet: string;
  rank: number;
}

/**
 * Postgres full-text search across published KB articles. Uses
 * `to_tsvector('portuguese', title || body)` and `plainto_tsquery` so
 * the agent tool doesn't have to sanitize the user's question.
 *
 * Returns top `limit` hits ranked by ts_rank_cd, with a 240-char snippet
 * that already has the matching terms wrapped in `<<mark>>…<<endmark>>`
 * for the LLM (it can ignore the markers — they're a soft hint).
 */
export async function kbSearch(query: string, limit = 5): Promise<KbSearchHit[]> {
  if (!query.trim()) return [];

  const result = await db.execute<{
    id: string;
    title: string;
    summary: string | null;
    snippet: string;
    rank: number;
  }>(sql`
    SELECT
      ${kbArticles.id} AS id,
      ${kbArticles.title} AS title,
      ${kbArticles.summary} AS summary,
      ts_headline(
        'portuguese',
        ${kbArticles.body},
        plainto_tsquery('portuguese', ${query}),
        'MaxFragments=2, MaxWords=30, MinWords=5, StartSel="<<mark>>", StopSel="<<endmark>>"'
      ) AS snippet,
      ts_rank_cd(
        to_tsvector('portuguese', coalesce(${kbArticles.title},'') || ' ' || coalesce(${kbArticles.body},'')),
        plainto_tsquery('portuguese', ${query})
      ) AS rank
    FROM ${kbArticles}
    WHERE ${kbArticles.isPublished} = true
      AND to_tsvector('portuguese', coalesce(${kbArticles.title},'') || ' ' || coalesce(${kbArticles.body},''))
          @@ plainto_tsquery('portuguese', ${query})
    ORDER BY rank DESC
    LIMIT ${limit}
  `);
  const rows = (result as unknown as { rows?: KbSearchHit[] }).rows ?? (result as unknown as KbSearchHit[]);
  return Array.isArray(rows) ? rows : [];
}
