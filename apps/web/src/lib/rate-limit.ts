/**
 * Redis-backed token-bucket rate limiter. Lightweight, sem deps externos.
 *
 * Uso:
 *   const ok = await rateLimit({ key: `lgpd:${ip}`, limit: 5, windowSec: 3600 });
 *   if (!ok) return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
 */
import { redis } from './redis';

interface RateLimitOptions {
  /** Unique key (e.g. `lgpd:1.2.3.4`, `login:user@x.com`). */
  key: string;
  /** Max requests allowed within the window. */
  limit: number;
  /** Window length in seconds. */
  windowSec: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetIn: number;
}

export async function rateLimit({
  key,
  limit,
  windowSec,
}: RateLimitOptions): Promise<RateLimitResult> {
  const fullKey = `rl:${key}`;
  // INCR + EXPIRE pattern. Atomic via pipeline.
  const pipe = redis.pipeline();
  pipe.incr(fullKey);
  pipe.ttl(fullKey);
  const res = (await pipe.exec()) as [Error | null, number][];
  const count = res[0][1];
  let ttl = res[1][1];
  if (ttl < 0) {
    await redis.expire(fullKey, windowSec);
    ttl = windowSec;
  }
  return {
    allowed: count <= limit,
    remaining: Math.max(0, limit - count),
    resetIn: ttl,
  };
}
