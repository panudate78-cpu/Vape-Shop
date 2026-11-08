"use client";
import { useState } from "react";

export default function ImportPage() {
  const [text, setText] = useState("product_name,brand,sku,flavor,nicotine_strength,bottle_size,color,price,stock,low_stock_threshold,is_active\n\"Arctic Mango Ice 50ml Shortfill\",Frostline,FRST-MAN-TEST,\"Mango Ice\",3mg,50ml,,15.99,100,10,true");
  const [msg, setMsg] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const run = async (csv: string) => {
    setMsg("Importing…");
    const r = await fetch("/api/admin/import", { method: "POST", headers: { "Content-Type": "text/csv" }, body: csv });
    const j = await r.json();
    setMsg(r.ok ? `✓ Imported: ${j.updated} updated, ${j.created} created (of ${j.total})` : `✗ ${j.error}`);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="rounded-2xl border border-white/10 bg-zinc-900 p-5">
        <h2 className="font-extrabold text-white">Bulk CSV import</h2>
        <p className="mt-1 text-xs text-zinc-400">Match SKU → update stock/price. New product_name → create product + variant. Header must be:<br /><span className="font-mono text-[11px] text-violet-300">product_name,brand,sku,flavor,nicotine_strength,bottle_size,color,price,stock,low_stock_threshold,is_active</span></p>
        <input type="file" accept=".csv" onChange={(e) => setFile(e.target.files?.[0] || null)} className="mt-3 w-full text-xs text-zinc-300" />
        {file && <button onClick={() => file.text().then(run)} className="mt-2 w-full rounded-xl bg-amber-400 py-2.5 text-xs font-black text-black">Upload {file.name}</button>}
        <p className="mt-3 text-xs font-bold text-zinc-300">Or paste CSV:</p>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={10} className="mt-1 w-full rounded-xl border border-white/10 bg-zinc-950 p-3 font-mono text-[11px] outline-none" />
        <button onClick={() => run(text)} className="mt-2 w-full rounded-xl border border-amber-400/50 py-2.5 text-xs font-black text-amber-300">Import pasted CSV</button>
        {msg && <p className="mt-2 text-xs font-bold text-white">{msg}</p>}
      </div>
      <div className="rounded-2xl border border-white/10 bg-zinc-900 p-5">
        <h2 className="font-extrabold text-white">Export</h2>
        <p className="mt-1 text-xs text-zinc-400">Download the full variant inventory as CSV for spreadsheets / stock counts.</p>
        <a href="/api/admin/export" className="mt-3 block rounded-xl bg-white py-2.5 text-center text-xs font-black text-black">⬇ Download inventory.csv</a>
        <div className="mt-5 rounded-xl bg-black/30 p-4 text-[11px] leading-relaxed text-zinc-400">
          <p className="font-bold text-white">Payment gateway env reference</p>
          <pre className="mt-2 whitespace-pre-wrap font-mono text-[11px] text-violet-200">{`PAYMENT_GATEWAY=mock
# authorize_net | nmi | square | viva
PAYMENT_MODE=sandbox
MOCK_WEBHOOK_SECRET=wh_mock_secret
AUTHORIZENET_API_LOGIN_ID=
AUTHORIZENET_TRANSACTION_KEY=
NMI_SECURITY_KEY=
SQUARE_ACCESS_TOKEN=
SQUARE_LOCATION_ID=
VIVA_MERCHANT_ID=
VIVA_API_KEY=
ADMIN_EMAIL=admin@vapeshop.co.uk
ADMIN_PASSWORD=Admin123!
NEXT_PUBLIC_AGE_THRESHOLD=18`}</pre>
        </div>
      </div>
    </div>
  );
}
