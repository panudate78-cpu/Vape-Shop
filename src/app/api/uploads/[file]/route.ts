import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

export const dynamic = 'force-dynamic';

const UPLOAD_DIR = '/tmp/drcloud-uploads';

// Serve back files that were uploaded to the temp dir. Also falls back to
// /public/uploads so existing images from local dev / pre-serverless
// uploads still work. No auth check: product images are public.
export async function GET(_req: Request, { params }: { params: { file: string } }) {
  const { file } = params;
  // Prevent path traversal
  const safe = file.replace(/[^a-zA-Z0-9._-]/g, '');
  const candidates = [
    join(UPLOAD_DIR, safe),
    join(process.cwd(), 'public', 'uploads', safe),
  ];
  for (const p of candidates) {
    if (existsSync(p)) {
      const data = await readFile(p);
      const ext = safe.split('.').pop()?.toLowerCase();
      const ctype = ext === 'png' ? 'image/png'
        : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg'
        : ext === 'webp' ? 'image/webp'
        : ext === 'gif' ? 'image/gif'
        : 'application/octet-stream';
      return new NextResponse(data, { headers: { 'content-type': ctype, 'cache-control': 'public, max-age=31536000, immutable' } });
    }
  }
  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}
