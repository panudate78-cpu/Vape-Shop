import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Auto-trigger the idempotent seed once per server boot — fire-and-forget, won't block the response.
// (For production, run `npx drizzle-kit push` + hit /api/seed explicitly instead.)
let seeded = false;
export function middleware(req: NextRequest) {
  if (!seeded && req.nextUrl.pathname !== '/api/seed') {
    seeded = true;
    const url = req.nextUrl.clone();
    url.pathname = '/api/seed';
    fetch(url.toString()).catch(() => {});
  }
  return NextResponse.next();
}
export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
