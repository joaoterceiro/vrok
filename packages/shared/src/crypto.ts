/**
 * AES-256-GCM helper used to encrypt sensitive channel config (tokens, API
 * keys) at rest inside Postgres. The key is derived from APP_SECRET via SHA-256.
 *
 * Encrypted strings have the form: `v1:<iv-base64>:<authTag-base64>:<ciphertext-base64>`.
 * The `v1:` prefix lets us rotate the algorithm later without ambiguity.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;
const PREFIX = 'v1';

function getKey(): Buffer {
  const secret = process.env.APP_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error('APP_SECRET must be set to at least 16 chars to use channel encryption');
  }
  return createHash('sha256').update(secret).digest();
}

export function encryptString(plaintext: string): string {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, getKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}:${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`;
}

export function decryptString(blob: string): string {
  const parts = blob.split(':');
  if (parts.length !== 4 || parts[0] !== PREFIX) {
    throw new Error('decryptString: invalid ciphertext format');
  }
  const [, ivB64, tagB64, dataB64] = parts;
  const iv = Buffer.from(ivB64!, 'base64');
  const tag = Buffer.from(tagB64!, 'base64');
  const data = Buffer.from(dataB64!, 'base64');
  const decipher = createDecipheriv(ALGO, getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

/**
 * Encrypt every leaf string value of an object recursively. Useful for the
 * `config` jsonb column on `channels` — we keep the structure searchable but
 * the actual secrets are opaque.
 */
export function encryptConfig<T extends Record<string, unknown>>(
  obj: T,
  fields: readonly (keyof T & string)[],
): T {
  const out: Record<string, unknown> = { ...obj };
  for (const f of fields) {
    const v = obj[f];
    if (typeof v === 'string' && v.length > 0) {
      out[f] = encryptString(v);
    }
  }
  return out as T;
}

export function decryptConfig<T extends Record<string, unknown>>(
  obj: T,
  fields: readonly (keyof T & string)[],
): T {
  const out: Record<string, unknown> = { ...obj };
  for (const f of fields) {
    const v = obj[f];
    if (typeof v === 'string' && v.startsWith(`${PREFIX}:`)) {
      out[f] = decryptString(v);
    }
  }
  return out as T;
}
