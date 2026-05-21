import { and, eq } from 'drizzle-orm';
import { optOuts } from '@zora/db';
import type { ChannelType } from '@zora/shared';
import { db } from './db';
import { log } from './logger';

/** Default keywords for opt-out detection — Brazilian Portuguese first. */
export const DEFAULT_OPT_OUT_KEYWORDS = [
  'sair',
  'parar',
  'cancelar',
  'descadastrar',
  'unsubscribe',
  'stop',
  'remover',
  'não envie mais',
  'nao envie mais',
];

export function isOptOutKeyword(text: string, keywords = DEFAULT_OPT_OUT_KEYWORDS): boolean {
  if (!text) return false;
  const norm = text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
  // Only treat very short messages (<= 30 chars) as opt-out triggers — otherwise
  // we get false positives from "não envie mais essa propaganda, por favor…"
  // (which IS opt-out) vs "stop, eu não quero parar agora" (mention).
  if (norm.length > 60) return false;
  return keywords.some((kw) => {
    const k = kw.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
    // Anchor at word boundary to avoid matching substrings inside words.
    const re = new RegExp(`(^|\\b)${k}(\\b|$)`);
    return re.test(norm);
  });
}

export async function recordOptOut(
  contactId: string,
  channelType: ChannelType | null,
  source: 'keyword' | 'manual' | 'link',
  reason?: string,
): Promise<void> {
  await db
    .insert(optOuts)
    .values({
      contactId,
      channelType: channelType ?? null,
      source,
      reason: reason ?? null,
    })
    .onConflictDoNothing({ target: [optOuts.contactId, optOuts.channelType] });
  log.info({ contactId, channelType, source }, 'opt-out recorded');
}

export async function isOptedOut(
  contactId: string,
  channelType: ChannelType | null,
): Promise<boolean> {
  const rows = await db
    .select({ id: optOuts.id })
    .from(optOuts)
    .where(
      and(
        eq(optOuts.contactId, contactId),
        channelType ? eq(optOuts.channelType, channelType) : undefined,
      ),
    )
    .limit(1);
  if (rows.length > 0) return true;
  // Also check channel-agnostic opt-out (channelType = null entry).
  if (channelType) {
    const any = await db
      .select({ id: optOuts.id })
      .from(optOuts)
      .where(and(eq(optOuts.contactId, contactId)))
      .limit(1);
    return any.length > 0;
  }
  return false;
}
