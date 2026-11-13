import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Minimal middleware.
 *
 * - Does NOT touch the database or fire fetch() on boot. Edge runtime
 *   on Vercel cannot resolve self-fetches reliably and cannot load
 *   native postgres drivers, so doing either here causes 500s on every
 *   request.
 * - Security / redirect headers only. Age-gating is handled client-side
 *   by <AgeGate />; auth is enforced server-side per route.
 */
export function middleware(req: NextRequest) {
  // Pass the path to server components (the root layout uses it for maintenance mode).
  const headers = new Headers(req.headers);
  headers.set('x-pathname', req.nextUrl.pathname);
  const res = NextResponse.next({ request: { headers } });
  // Basic hardening headers.
  res.headers.set('X-Content-Type-Options', 'nosniff');
  res.headers.set('X-Frame-Options', 'DENY');
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  return res;
}

// Apply to everything except static assets, images, favicon, public files.
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|images/|fonts/).*)'],
};
