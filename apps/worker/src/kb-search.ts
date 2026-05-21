import { sql } from 'drizzle-orm';
import { kbArticles } from '@zora/db';
import { db } from './db';

export interface KbSearchHit {
  id: string;
  title: string;
  summary: string | null;
  snippet: string;
}

/**
 * Worker-side knowledge-base search. Mirrors the web `kbSearch` helper —
 * same Postgres FTS query, but resolves the `db` instance from the worker
 * package so we don't cross the package boundary.
 */
export async function kbSearch(query: string, limit = 5): Promise<KbSearchHit[]> {
  if (!query.trim()) return [];
  const result = await db.execute<KbSearchHit>(sql`
    SELECT
      ${kbArticles.id} AS id,
      ${kbArticles.title} AS title,
      ${kbArticles.summary} AS summary,
      ts_headline(
        'portuguese',
        ${kbArticles.body},
        plainto_tsquery('portuguese', ${query}),
        'MaxFragments=2, MaxWords=30, MinWords=5'
      ) AS snippet
    FROM ${kbArticles}
    WHERE ${kbArticles.isPublished} = true
      AND to_tsvector('portuguese', coalesce(${kbArticles.title},'') || ' ' || coalesce(${kbArticles.body},''))
          @@ plainto_tsquery('portuguese', ${query})
    ORDER BY ts_rank_cd(
      to_tsvector('portuguese', coalesce(${kbArticles.title},'') || ' ' || coalesce(${kbArticles.body},'')),
      plainto_tsquery('portuguese', ${query})
    ) DESC
    LIMIT ${limit}
  `);
  const rows = (result as unknown as { rows?: KbSearchHit[] }).rows ?? (result as unknown as KbSearchHit[]);
  return Array.isArray(rows) ? rows : [];
}
