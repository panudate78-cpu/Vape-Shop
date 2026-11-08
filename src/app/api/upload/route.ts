import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/session';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';

export const dynamic = 'force-dynamic';

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

/**
 * Simple image upload endpoint (admin only).
 *
 * Accepts multipart/form-data with a single "file" field, saves to
 * /public/uploads/<uuid>.<ext>, returns { url: "/uploads/xxx.jpg" }.
 *
 * NOTE: On Vercel's serverless runtime the filesystem is ephemeral —
 * uploaded files will disappear on the next deploy. For production use
 * this should be switched to Vercel Blob / S3 / Cloudflare R2, but this
 * gets product image management working for the MVP.
 */
export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden — sign in as admin first' }, { status: 403 });

  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'No file provided (send field "file").' }, { status: 400 });
  if (!ALLOWED.includes(file.type)) return NextResponse.json({ error: `Unsupported type ${file.type}. Use JPG/PNG/WebP/GIF.` }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'File too large (max 5MB).' }, { status: 400 });

  const buf = Buffer.from(await file.arrayBuffer());
  const ext = file.type.split('/')[1].replace('jpeg', 'jpg');
  const name = `${randomUUID()}.${ext}`;
  const dir = join(process.cwd(), 'public', 'uploads');
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, name), buf);
  return NextResponse.json({ url: `/uploads/${name}` });
}
