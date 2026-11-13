import './globals.css';
import type { Metadata } from 'next';
import { BRAND } from '@/lib/brand';
import { Chrome } from '@/components/chrome';
import { StoreProvider } from '@/lib/store';
import { headers } from 'next/headers';
import { MaintenancePage } from '@/components/maintenance-page';
import { readMaintenance, isStaffSession } from '@/lib/maintenance';
import Link from 'next/link';

export const metadata: Metadata = {
  title: `${BRAND.fullName} — ${BRAND.tagline}`,
  description: `Local vape & mobile repair shop, ${BRAND.address.line1}, ${BRAND.address.city}. Same-day Click & Collect, phone repairs while you wait. 18+ only.`,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Maintenance mode: customers see the maintenance page. Staff, the login page and the admin area stay available.
  const h = headers();
  const path = h.get('x-pathname') || '/';
  const exempt = path.startsWith('/login') || path.startsWith('/admin') || path.startsWith('/api');
  const state = exempt ? { enabled: false } : await readMaintenance();
  const staff = state.enabled ? await isStaffSession() : false;
  const preview = h.get('x-maintenance-preview') === '1';
  // Customers always get the maintenance page. Staff get the normal site, unless they open ?preview=maintenance.
  const maintenance = state.enabled && (!staff || preview);
  const staffBanner = state.enabled && staff && !exempt;
  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col bg-white text-slate-900">
        <StoreProvider>
          {staffBanner && (
            <div role="status" className="bg-amber-400 text-slate-900 text-sm font-semibold px-4 py-2 text-center">
              Maintenance mode is ON. Customers see the maintenance page. You are seeing the normal site as staff.{' '}
              {preview ? (
                <Link className="underline" href="/admin/site">Back to Site &amp; maintenance</Link>
              ) : (
                <>
                  <Link className="underline" href="/?preview=maintenance">Preview the customer page</Link>
                  {' · '}
                  <Link className="underline" href="/admin/site">Site &amp; maintenance</Link>
                </>
              )}
            </div>
          )}
          {maintenance ? <MaintenancePage /> : <Chrome>{children}</Chrome>}
        </StoreProvider>
      </body>
    </html>
  );
}
