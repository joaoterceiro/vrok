import { Client as MinioClient } from 'minio';

const endpoint = process.env.MINIO_ENDPOINT ?? 'minio';
const port = Number(process.env.MINIO_PORT ?? 9000);
const useSSL = process.env.MINIO_USE_SSL === 'true';

let cached: MinioClient | null = null;
export function getMinio(): MinioClient {
  if (cached) return cached;
  cached = new MinioClient({
    endPoint: endpoint,
    port,
    useSSL,
    accessKey: process.env.MINIO_ACCESS_KEY ?? '',
    secretKey: process.env.MINIO_SECRET_KEY ?? '',
  });
  return cached;
}

export const MINIO_BUCKET = process.env.MINIO_BUCKET ?? 'zora-media';

export async function ensureBucket(): Promise<void> {
  const c = getMinio();
  const exists = await c.bucketExists(MINIO_BUCKET).catch(() => false);
  if (!exists) await c.makeBucket(MINIO_BUCKET);
}

export async function uploadStream(
  key: string,
  stream: NodeJS.ReadableStream,
  size: number,
  mime: string,
): Promise<void> {
  await ensureBucket();
  await getMinio().putObject(MINIO_BUCKET, key, stream, size, {
    'Content-Type': mime,
  });
}

/**
 * Generate a short-lived URL providers (Evolution, WA Cloud) can use to GET
 * an object without authentication. Defaults to 1 hour. The URL is rewritten
 * to use `MINIO_INTERNAL_URL` (Docker service name) so the provider sees a
 * URL reachable from inside the network.
 */
export async function presignedGetUrl(key: string, expirySeconds = 60 * 60): Promise<string> {
  const signed = await getMinio().presignedGetObject(MINIO_BUCKET, key, expirySeconds);
  const internal = process.env.MINIO_INTERNAL_URL;
  if (!internal) return signed;
  // Replace the SDK's host:port (built from MINIO_ENDPOINT) with the Docker
  // service hostname so the URL is reachable by other containers.
  const u = new URL(signed);
  const target = new URL(internal);
  u.protocol = target.protocol;
  u.hostname = target.hostname;
  u.port = target.port;
  return u.toString();
}
