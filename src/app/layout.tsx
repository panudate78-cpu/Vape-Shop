import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { StoreProvider } from "@/lib/store";
import { NicotineBanner, Header, CartDrawer, AgeGate, Footer } from "@/components/chrome";

export const metadata: Metadata = {
  title: "Dr Cloud Chessington — Vape Shop & Mobile Store | Bridge Road KT9 2RT",
  description:
    "Dr Cloud Chessington — your local vape shop on Unit 4 Bridge Road, Chessington KT9 2RT. E-liquids, pod systems, mods, coils & accessories with same-day Click & Collect. 18+ only.",
  openGraph: {
    title: "Dr Cloud Chessington — Vape Shop & Mobile Store",
    description:
      "Local vape shop & mobile repair store in Chessington. E-liquids, pods, mods & same-day Click & Collect at Unit 4 Bridge Road, KT9 2RT.",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-zinc-950 text-zinc-100 antialiased">
        <StoreProvider>
          <NicotineBanner />
          <Header />
          <AgeGate />
          <CartDrawer />
          <main className="min-h-[70vh]">{children}</main>
          <div className="border-t border-amber-400/30 bg-amber-400/10 px-4 py-2 text-center text-[11px] font-medium text-amber-200">
            WARNING: Nicotine is addictive. Vaping products are intended for adult smokers only (18+). Keep away from children & pets.
          </div>
          <Footer />
        </StoreProvider>
      </body>
    </html>
  );
}
