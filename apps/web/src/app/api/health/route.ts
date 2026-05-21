import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@zora/db';
import { redis } from '@/lib/redis';
import { minio, MINIO_BUCKET } from '@/lib/minio';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type CheckStatus = 'ok' | 'degraded' | 'error' | 'skipped';
interface Check {
  status: CheckStatus;
  latencyMs?: number;
  detail?: string;
}

const HEALTH_TIMEOUT_MS = 1500;

/**
 * Liveness + readiness probe. Hits every backing service with a short
 * timeout so a slow dependency doesn't pin the request. Each dependency is
 * its own field so monitoring can alert on the right thing.
 *
 * Returns HTTP 200 when DB + Redis + MinIO are all healthy, 503 otherwise.
 * Evolution is non-critical (other channels still work without it).
 */
export async function GET() {
  const started = Date.now();

  const [db_, redis_, minio_, evolution_] = await Promise.all([
    timedCheck(checkDb),
    timedCheck(checkRedis),
    timedCheck(checkMinio),
    timedCheck(checkEvolution),
  ]);

  const critical: Check[] = [db_, redis_, minio_];
  const ok = critical.every((c) => c.status === 'ok');

  return NextResponse.json(
    {
      status: ok ? 'ok' : 'degraded',
      service: 'zora-web',
      uptimeMs: process.uptime() * 1000,
      latencyMs: Date.now() - started,
      timestamp: new Date().toISOString(),
      checks: { db: db_, redis: redis_, minio: minio_, evolution: evolution_ },
    },
    { status: ok ? 200 : 503 },
  );
}

async function timedCheck(fn: () => Promise<Check>): Promise<Check> {
  const start = Date.now();
  try {
    const result = await Promise.race([
      fn(),
      new Promise<Check>((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), HEALTH_TIMEOUT_MS),
      ),
    ]);
    return { ...result, latencyMs: Date.now() - start };
  } catch (err) {
    return {
      status: 'error',
      latencyMs: Date.now() - start,
      detail: (err as Error).message,
    };
  }
}

async function checkDb(): Promise<Check> {
  await db.execute(sql`SELECT 1`);
  return { status: 'ok' };
}

async function checkRedis(): Promise<Check> {
  const reply = await redis.ping();
  return reply === 'PONG' ? { status: 'ok' } : { status: 'degraded', detail: reply };
}

async function checkMinio(): Promise<Check> {
  const exists = await minio.bucketExists(MINIO_BUCKET);
  return exists
    ? { status: 'ok' }
    : { status: 'degraded', detail: `bucket "${MINIO_BUCKET}" missing` };
}

async function checkEvolution(): Promise<Check> {
  const base =
    process.env.EVOLUTION_URL ??
    process.env.EVOLUTION_BASE_URL ??
    process.env.INTERNAL_EVOLUTION_URL;
  if (!base) return { status: 'skipped', detail: 'EVOLUTION_URL not set' };
  const apiKey = process.env.EVOLUTION_API_KEY;
  const res = await fetch(new URL('/instance/fetchInstances', base), {
    headers: apiKey ? { apikey: apiKey } : undefined,
    signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
  });
  if (!res.ok) return { status: 'degraded', detail: `HTTP ${res.status}` };
  return { status: 'ok' };
}
