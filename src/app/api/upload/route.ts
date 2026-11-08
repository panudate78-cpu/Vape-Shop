import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/session';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';

export const dynamic = 'force-dynamic';

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

// Writable directory on Vercel serverless is /tmp (project dir is read-only
// after build). /tmp is also writable in local dev, so the same code works.
const UPLOAD_DIR = '/tmp/drcloud-uploads';

/**
 * Image upload endpoint (admin only).
 *
 * Accepts multipart/form-data with a single "file" field, saves to the
 * server's writable temp dir, returns { url: "/api/uploads/xxx.jpg" }
 * which the sibling route (/api/uploads/[file]/route.ts) serves back.
 *
 * NOTE: /tmp is ephemeral on serverless — files disappear after a cold
 * start or deploy. For production persistence, switch to Vercel Blob /
 * S3 / Cloudflare R2 (documented in SETUP.md).
 */
export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden — sign in as admin first' }, { status: 403 });

  try {
    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return NextResponse.json({ error: 'No file provided (send field "file").' }, { status: 400 });
    if (!ALLOWED.includes(file.type)) return NextResponse.json({ error: `Unsupported type ${file.type}. Use JPG/PNG/WebP/GIF.` }, { status: 400 });
    if (file.size > MAX_BYTES) return NextResponse.json({ error: 'File too large (max 5MB).' }, { status: 400 });

    const buf = Buffer.from(await file.arrayBuffer());
    const ext = file.type.split('/')[1].replace('jpeg', 'jpg');
    const name = `${randomUUID()}.${ext}`;
    await mkdir(UPLOAD_DIR, { recursive: true });
    await writeFile(join(UPLOAD_DIR, name), buf);
    return NextResponse.json({ url: `/api/uploads/${name}` });
  } catch (e: any) {
    console.error('[upload] failed:', e);
    return NextResponse.json({ error: `Upload failed: ${e?.message || e}` }, { status: 500 });
  }
}
