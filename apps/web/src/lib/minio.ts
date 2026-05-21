import { Client as MinioClient } from 'minio';

const endpoint = process.env.MINIO_ENDPOINT ?? 'localhost';
const port = Number(process.env.MINIO_PORT ?? 9000);
const useSSL = process.env.MINIO_USE_SSL === 'true';

const globalForMinio = globalThis as unknown as { __zoraMinio?: MinioClient };

export const minio: MinioClient =
  globalForMinio.__zoraMinio ??
  new MinioClient({
    endPoint: endpoint,
    port,
    useSSL,
    accessKey: process.env.MINIO_ACCESS_KEY ?? '',
    secretKey: process.env.MINIO_SECRET_KEY ?? '',
  });

if (process.env.NODE_ENV !== 'production') {
  globalForMinio.__zoraMinio = minio;
}

export const MINIO_BUCKET = process.env.MINIO_BUCKET ?? 'zora-media';

export async function ensureBucket(): Promise<void> {
  const exists = await minio.bucketExists(MINIO_BUCKET).catch(() => false);
  if (!exists) {
    await minio.makeBucket(MINIO_BUCKET);
  }
}

export async function presignedGetUrl(key: string, expirySeconds = 60 * 60): Promise<string> {
  return minio.presignedGetObject(MINIO_BUCKET, key, expirySeconds);
}

export async function presignedPutUrl(key: string, expirySeconds = 60 * 5): Promise<string> {
  return minio.presignedPutObject(MINIO_BUCKET, key, expirySeconds);
}
