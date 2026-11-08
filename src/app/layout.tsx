import './globals.css';
import type { Metadata } from 'next';
import { BRAND } from '@/lib/brand';
import { Chrome } from '@/components/chrome';
import { StoreProvider } from '@/lib/store';

export const metadata: Metadata = {
  title: `${BRAND.fullName} — ${BRAND.tagline}`,
  description: `Local vape & mobile repair shop, ${BRAND.address.line1}, ${BRAND.address.city}. Same-day Click & Collect, phone repairs while you wait. 18+ only.`,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col bg-zinc-950 text-zinc-100">
        <StoreProvider>
          <Chrome>{children}</Chrome>
        </StoreProvider>
      </body>
    </html>
  );
}
