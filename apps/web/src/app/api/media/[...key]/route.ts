import { NextResponse } from 'next/server';
import { minio, MINIO_BUCKET } from '@/lib/minio';
import { requireSession } from '@/lib/api/guards';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Streams media from MinIO via the authenticated app proxy. Keys must start
 * with one of the known prefixes (`incoming/`, `outgoing/`, `templates/`),
 * contain only safe characters, and must NOT include any path-traversal
 * segments. This blocks attacks like `/api/media/../../etc/passwd`.
 */
const ALLOWED_PREFIXES = ['incoming/', 'outgoing/', 'templates/', 'campaigns/'];
const SAFE_KEY = /^[A-Za-z0-9._/-]+$/;

function isSafeKey(key: string): boolean {
  if (!key || key.length > 512) return false;
  if (!SAFE_KEY.test(key)) return false;
  // No leading slash, no `..` segments anywhere in the path.
  if (key.startsWith('/') || key.startsWith('.')) return false;
  for (const seg of key.split('/')) {
    if (seg === '' || seg === '.' || seg === '..') return false;
  }
  return ALLOWED_PREFIXES.some((p) => key.startsWith(p));
}

export async function GET(_req: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const { key } = await params;
  const objectKey = key.join('/');

  if (!isSafeKey(objectKey)) {
    return NextResponse.json({ error: 'invalid key' }, { status: 400 });
  }

  try {
    const stat = await minio.statObject(MINIO_BUCKET, objectKey);
    const stream = await minio.getObject(MINIO_BUCKET, objectKey);
    return new Response(stream as unknown as ReadableStream, {
      headers: {
        'Content-Type': stat.metaData?.['content-type'] ?? 'application/octet-stream',
        'Content-Length': String(stat.size),
        'Cache-Control': 'private, max-age=86400',
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: 'not found', detail: (err as Error).message },
      { status: 404 },
    );
  }
}
