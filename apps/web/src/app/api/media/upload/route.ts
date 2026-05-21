import { NextResponse, type NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { minio, MINIO_BUCKET, ensureBucket } from '@/lib/minio';
import { requireSession } from '@/lib/api/guards';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB per file

/**
 * Receives a `FormData` upload (single field `file`) from the inbox composer,
 * persists to MinIO, and returns a stable URL the message can reference.
 */
export async function POST(req: NextRequest) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: 'invalid form' }, { status: 400 });
  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'missing file' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `file too large (max ${MAX_BYTES / 1024 / 1024} MB)` },
      { status: 413 },
    );
  }

  await ensureBucket();
  const mime = file.type || 'application/octet-stream';
  const ext = extFromMime(mime, file.name);
  const key = `outgoing/${session.user.id}/${randomUUID()}.${ext}`;
  const buf = Buffer.from(await file.arrayBuffer());

  await minio.putObject(MINIO_BUCKET, key, Readable.from(buf), buf.byteLength, {
    'Content-Type': mime,
  });

  return NextResponse.json({
    url: `/api/media/${encodeURI(key)}`,
    minioKey: key,
    mime,
    size: buf.byteLength,
    filename: file.name,
  });
}

function extFromMime(mime: string, filename: string): string {
  const fromName = filename.includes('.') ? filename.split('.').pop()! : '';
  if (fromName && fromName.length <= 6) return fromName.toLowerCase();
  const m = mime.toLowerCase();
  if (m.startsWith('image/jpeg')) return 'jpg';
  if (m.startsWith('image/png')) return 'png';
  if (m.startsWith('image/webp')) return 'webp';
  if (m.startsWith('image/gif')) return 'gif';
  if (m.startsWith('audio/webm')) return 'webm';
  if (m.startsWith('audio/ogg')) return 'ogg';
  if (m.startsWith('audio/mpeg')) return 'mp3';
  if (m.startsWith('audio/wav')) return 'wav';
  if (m.startsWith('video/mp4')) return 'mp4';
  if (m.startsWith('application/pdf')) return 'pdf';
  return 'bin';
}
