import Link from "next/link";
import { BRAND, fullAddress } from "@/lib/brand";

export const metadata = {
  title: "Visit Dr Cloud Chessington — Bridge Road Vape Shop & Phone Repairs",
  description: `Find Dr Cloud Chessington at ${fullAddress}. Opening hours, Click & Collect info, phone repairs and directions.`,
};

export default function VisitPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <p className="text-xs text-zinc-500"><Link href="/" className="hover:text-white">Home</Link> / Visit us</p>
      <h1 className="mt-2 text-3xl font-black text-white">Visit Dr Cloud Chessington</h1>
      <p className="mt-1 text-sm text-zinc-400">{BRAND.tagline} · Vape shop + mobile repairs on Bridge Road.</p>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/chessington-shop.jpg" alt="Inside Dr Cloud Chessington" className="aspect-video w-full rounded-2xl border border-white/10 object-cover" />
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-zinc-900 p-5">
              <p className="text-xs font-extrabold uppercase tracking-widest text-teal-300">Find us</p>
              <p className="mt-2 font-extrabold text-white">{BRAND.address.line1}<br />{BRAND.address.town}, {BRAND.address.county}<br />{BRAND.address.postcode}</p>
              <a href={BRAND.mapsUrl} target="_blank" rel="noreferrer" className="mt-3 inline-block rounded-xl bg-teal-500 px-4 py-2 text-xs font-extrabold text-black">Get directions →</a>
            </div>
            <div className="rounded-2xl border border-white/10 bg-zinc-900 p-5">
              <p className="text-xs font-extrabold uppercase tracking-widest text-teal-300">Contact</p>
              <a href={BRAND.phoneHref} className="mt-2 block text-xl font-black text-white">{BRAND.phone}</a>
              <p className="mt-1 text-xs text-zinc-400">{BRAND.email}</p>
              <p className="mt-2 text-xs text-zinc-300">Call for stock checks, flavour advice & repair quotes.</p>
            </div>
          </div>
          <div className="mt-3 rounded-2xl border border-white/10 bg-zinc-900 p-5">
            <p className="text-xs font-extrabold uppercase tracking-widest text-teal-300">Opening hours</p>
            <div className="mt-2 space-y-1.5 text-sm">
              {BRAND.hours.map((h) => (
                <div key={h.days} className="flex justify-between border-b border-white/5 pb-1.5 text-zinc-300">
                  <span>{h.days}</span><span className="font-bold text-white">{h.time}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="overflow-hidden rounded-2xl border border-white/10">
            <iframe
              title="Dr Cloud Chessington map"
              src="https://www.google.com/maps?q=Dr+Cloud+Unit+4+Bridge+Rd+Chessington+KT9+2RT&output=embed"
              className="h-72 w-full"
              loading="lazy"
            />
          </div>
          <div className="rounded-2xl border border-teal-400/30 bg-teal-400/5 p-5">
            <p className="font-extrabold text-white">⚡ How Click & Collect works</p>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-zinc-300">
              <li>Shop online and choose <b>Click & Collect (Free)</b> at checkout.</li>
              <li>We confirm by email when your bag is ready — usually same day.</li>
              <li>Collect from {BRAND.address.line1} with photo ID if you look under 25 (18+ only).</li>
            </ol>
            <Link href="/shop" className="mt-3 inline-block rounded-xl bg-teal-500 px-5 py-2.5 text-xs font-extrabold text-black">Order for collection →</Link>
          </div>
          <div className="rounded-2xl border border-white/10 bg-zinc-900 p-5">
            <p className="font-extrabold text-white">📱 Phone repairs too</p>
            <p className="mt-1 text-sm text-zinc-400">Screens, batteries, charging ports & accessories — most repairs while you browse the vape shelves. Call <a href={BRAND.phoneHref} className="font-bold text-teal-300">{BRAND.phone}</a> for a quote.</p>
          </div>
          <div className="rounded-2xl border border-amber-400/25 bg-amber-400/5 p-4 text-[11px] leading-relaxed text-amber-200/90">
            ⚠️ 18+ only. Challenge 25 applies in store and online — please bring ID if asked. Nicotine is addictive.
          </div>
        </div>
      </div>
    </div>
  );
}
