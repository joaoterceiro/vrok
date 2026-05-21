import { NextResponse } from 'next/server';
import { z } from 'zod';
import { inArray, sql } from 'drizzle-orm';
import { db, appSettings } from '@zora/db';
import { encryptString } from '@zora/shared/crypto';
import { requireSession } from '@/lib/api/guards';
import { invalidateLlmConfigCache, LLM_SETTING_KEYS } from '@/lib/llm-config';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const KEY_FIELDS = [
  LLM_SETTING_KEYS.anthropicKey,
  LLM_SETTING_KEYS.openaiKey,
  LLM_SETTING_KEYS.groqKey,
] as const;

/**
 * GET /api/settings/llm — returns the current LLM config with API keys
 * masked (last 4 chars only). Admin-only.
 */
export async function GET() {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  if (session.user.role !== 'admin') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const rows = await db
    .select({ key: appSettings.key, value: appSettings.value, isSecret: appSettings.isSecret })
    .from(appSettings)
    .where(inArray(appSettings.key, [...Object.values(LLM_SETTING_KEYS)]));
  const byKey = new Map(rows.map((r) => [r.key, r]));

  return NextResponse.json({
    provider: byKey.get(LLM_SETTING_KEYS.provider)?.value ?? null,
    model: byKey.get(LLM_SETTING_KEYS.model)?.value ?? null,
    keys: {
      anthropic: mask(byKey.get(LLM_SETTING_KEYS.anthropicKey)?.value),
      openai: mask(byKey.get(LLM_SETTING_KEYS.openaiKey)?.value),
      groq: mask(byKey.get(LLM_SETTING_KEYS.groqKey)?.value),
    },
    env: {
      anthropic: !!process.env.ANTHROPIC_API_KEY,
      openai: !!process.env.OPENAI_API_KEY,
      groq: !!process.env.GROQ_API_KEY,
    },
  });
}

const patchSchema = z
  .object({
    provider: z.enum(['anthropic', 'openai', 'groq']).optional(),
    model: z.string().nullable().optional(),
    anthropicKey: z.string().nullable().optional(),
    openaiKey: z.string().nullable().optional(),
    groqKey: z.string().nullable().optional(),
  })
  .strict();

/**
 * PATCH /api/settings/llm — upsert any subset of settings. API keys are
 * encrypted at rest (AES-GCM via APP_SECRET). Passing an empty string or
 * null deletes the key. Admin-only.
 */
export async function PATCH(req: Request) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  if (session.user.role !== 'admin') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const parsed = patchSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid', issues: parsed.error.issues }, { status: 400 });
  }
  const data = parsed.data;

  const writes: Array<{ key: string; value: string | null; isSecret: boolean }> = [];
  if (data.provider !== undefined) {
    writes.push({ key: LLM_SETTING_KEYS.provider, value: data.provider, isSecret: false });
  }
  if (data.model !== undefined) {
    writes.push({ key: LLM_SETTING_KEYS.model, value: data.model?.trim() || null, isSecret: false });
  }
  if (data.anthropicKey !== undefined) {
    writes.push({
      key: LLM_SETTING_KEYS.anthropicKey,
      value: data.anthropicKey ? encryptString(data.anthropicKey) : null,
      isSecret: true,
    });
  }
  if (data.openaiKey !== undefined) {
    writes.push({
      key: LLM_SETTING_KEYS.openaiKey,
      value: data.openaiKey ? encryptString(data.openaiKey) : null,
      isSecret: true,
    });
  }
  if (data.groqKey !== undefined) {
    writes.push({
      key: LLM_SETTING_KEYS.groqKey,
      value: data.groqKey ? encryptString(data.groqKey) : null,
      isSecret: true,
    });
  }

  for (const w of writes) {
    if (w.value == null) {
      await db.delete(appSettings).where(sql`${appSettings.key} = ${w.key}`);
    } else {
      await db
        .insert(appSettings)
        .values({ key: w.key, value: w.value, isSecret: w.isSecret, updatedBy: session.user.id })
        .onConflictDoUpdate({
          target: appSettings.key,
          set: { value: w.value, isSecret: w.isSecret, updatedAt: new Date(), updatedBy: session.user.id },
        });
    }
  }

  invalidateLlmConfigCache();
  return NextResponse.json({ ok: true, written: writes.length });
}

function mask(blob: string | null | undefined): { set: boolean; suffix: string | null } {
  if (!blob) return { set: false, suffix: null };
  // Encrypted blob → we can't read it without decrypting. Just expose "set"
  // and a stable last-4 suffix derived from the ciphertext for fingerprinting.
  return { set: true, suffix: blob.slice(-4) };
}
