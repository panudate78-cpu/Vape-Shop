import { BRAND, fullAddress, googleMapsUrl } from '@/lib/brand';
import Link from 'next/link';

export const metadata = { title: `Visit us — ${BRAND.name}` };

export default function VisitPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Visit our store</h1>
        <p className="text-zinc-400 mt-1">Pop in for advice, samples, or to collect a Click & Collect order.</p>
      </div>
      <div className="grid md:grid-cols-2 gap-6">
        <div className="card space-y-3">
          <h2 className="text-lg font-bold">{BRAND.name}</h2>
          <p className="text-zinc-300">{fullAddress}</p>
          <p className="text-zinc-300">📞 <a href={`tel:${BRAND.phone}`} className="underline">{BRAND.phone}</a></p>
          <div>
            <div className="label">Opening hours</div>
            <ul className="text-sm text-zinc-300 space-y-0.5">
              {BRAND.hours.map((h) => <li key={h.day}><span className="text-zinc-500 w-24 inline-block">{h.day}</span>{h.time}</li>)}
            </ul>
          </div>
          <div className="flex gap-2 pt-2">
            <a href={googleMapsUrl} target="_blank" rel="noreferrer" className="btn-primary">Open in Google Maps</a>
            <Link href="/shop" className="btn-outline">Order for collection</Link>
          </div>
        </div>
        <div className="card">
          <h2 className="text-lg font-bold">Click & Collect</h2>
          <ol className="mt-2 list-decimal list-inside text-zinc-300 space-y-1 text-sm">
            <li>Browse the shop and add items to your basket.</li>
            <li>At checkout choose “Click & Collect” and verify your age with DOB.</li>
            <li>Pay online (mock checkout is enabled for testing).</li>
            <li>Wait for a “Ready for collection” update on your order page (usually within 15 minutes during opening hours).</li>
            <li>Bring your order number and photo ID to the counter. We operate Challenge 25.</li>
          </ol>
          <p className="mt-3 text-xs text-zinc-500">Typical collection time: same day if ordered before 6pm Mon–Sat, before 3pm Sunday.</p>
        </div>
      </div>
      <div className="card p-0 overflow-hidden">
        <iframe
          title="Map"
          src={`https://www.google.com/maps?q=${BRAND.mapsQuery}&output=embed`}
          className="w-full h-96 border-0"
          loading="lazy"
        />
      </div>
    </div>
  );
}
