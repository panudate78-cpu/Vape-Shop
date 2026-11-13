import './globals.css';
import type { Metadata } from 'next';
import { BRAND } from '@/lib/brand';
import { Chrome } from '@/components/chrome';
import { StoreProvider } from '@/lib/store';
import { headers } from 'next/headers';
import { MaintenancePage } from '@/components/maintenance-page';
import { readMaintenance, isStaffSession } from '@/lib/maintenance';

export const metadata: Metadata = {
  title: `${BRAND.fullName} — ${BRAND.tagline}`,
  description: `Local vape & mobile repair shop, ${BRAND.address.line1}, ${BRAND.address.city}. Same-day Click & Collect, phone repairs while you wait. 18+ only.`,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Maintenance mode: customers see the maintenance page. Staff, the login page and the admin area stay available.
  const path = headers().get('x-pathname') || '/';
  const exempt = path.startsWith('/login') || path.startsWith('/admin') || path.startsWith('/api');
  const maintenance = !exempt && (await readMaintenance()).enabled && !(await isStaffSession());
  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col bg-white text-slate-900">
        <StoreProvider>
          {maintenance ? <MaintenancePage /> : <Chrome>{children}</Chrome>}
        </StoreProvider>
      </body>
    </html>
  );
}
