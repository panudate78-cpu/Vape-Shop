'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { gbp } from '@/lib/format';

type VarItem = {
  variantId: number; productId: number; sku: string;
  name: string; brand: string; variantLabel: string;
  image: string | null; stock: number; price: number;
};
type CartLine = VarItem & { quantity: number };

export default function PosPage() {
  const [items, setItems] = useState<VarItem[]>([]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [q, setQ] = useState('');
  const [payment, setPayment] = useState<'cash' | 'card'>('cash');
  const [discount, setDiscount] = useState(0);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ ok: true; orderId: number; total: number } | { error: string } | null>(null);

  useEffect(() => {
    fetch('/api/admin/pos').then((r) => r.json()).then((d) => setItems(d.items || [])).catch(() => {});
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return items.slice(0, 80);
    return items.filter((i) =>
      i.name.toLowerCase().includes(s) ||
      (i.brand || '').toLowerCase().includes(s) ||
      (i.sku || '').toLowerCase().includes(s) ||
      (i.variantLabel || '').toLowerCase().includes(s)
    ).slice(0, 120);
  }, [items, q]);

  const addToCart = (v: VarItem) => {
    setCart((c) => {
      const existing = c.find((x) => x.variantId === v.variantId);
      if (existing) {
        if (existing.quantity >= v.stock) return c;
        return c.map((x) => x.variantId === v.variantId ? { ...x, quantity: x.quantity + 1 } : x);
      }
      return [...c, { ...v, quantity: 1 }];
    });
  };
  const changeQty = (id: number, delta: number) => {
    setCart((c) => c.map((x) => x.variantId === id ? { ...x, quantity: Math.max(0, Math.min(x.stock, x.quantity + delta)) } : x).filter((x) => x.quantity > 0));
  };

  const subtotal = cart.reduce((s, l) => s + l.price * l.quantity, 0);
  const total = Math.max(0, subtotal - discount);
  const itemCount = cart.reduce((s, l) => s + l.quantity, 0);

  const submit = async () => {
    if (!cart.length) return;
    setLoading(true); setResult(null);
    const res = await fetch('/api/admin/pos', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        items: cart.map((l) => ({ variantId: l.variantId, quantity: l.quantity })),
        paymentMethod: payment,
        staffNote: note,
        discount,
      }),
    });
    const d = await res.json();
    setLoading(false);
    if (!res.ok) { setResult({ error: d.error || 'Sale failed' }); return; }
    setResult({ ok: true, orderId: d.orderId, total: d.total });
    setCart([]); setDiscount(0); setNote(''); setQ('');
    // Refresh the product list so stock counts are current
    fetch('/api/admin/pos').then((r) => r.json()).then((dd) => setItems(dd.items || []));
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
      {/* Product picker */}
      <div>
        <div className="flex items-center gap-3 mb-4">
          <h2 className="text-xl font-extrabold">🛒 In-store sale (POS)</h2>
          <Link href="/admin/orders" className="ml-auto text-sm text-slate-400 hover:text-white">View orders →</Link>
        </div>
        <input
          className="input mb-3"
          placeholder="Search product, brand, SKU, flavour…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoFocus
        />
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 max-h-[65vh] overflow-y-auto pr-1">
          {filtered.map((v) => {
            const inCart = cart.find((c) => c.variantId === v.variantId)?.quantity ?? 0;
            const disabled = v.stock - inCart <= 0;
            return (
              <button
                key={v.variantId}
                onClick={() => !disabled && addToCart(v)}
                disabled={disabled}
                className={`text-left rounded-xl border p-3 bg-zinc-900 transition ${disabled ? 'opacity-40 cursor-not-allowed border-zinc-800' : 'border-zinc-800 hover:border-amber-400 hover:bg-zinc-800'}`}
              >
                <div className="h-24 w-full rounded-md bg-zinc-800 overflow-hidden mb-2 flex items-center justify-center text-3xl">
                  {v.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={v.image} alt="" className="h-full w-full object-cover" />
                  ) : '☁️'}
                </div>
                <p className="text-[10px] font-bold uppercase text-amber-400 tracking-wide">{v.brand}</p>
                <p className="text-sm font-bold text-white line-clamp-2">{v.name}</p>
                <p className="text-[11px] text-zinc-400 line-clamp-1">{v.variantLabel}</p>
                <div className="mt-1 flex items-center justify-between">
                  <span className="text-sm font-extrabold text-white">{gbp(v.price)}</span>
                  <span className={`text-[11px] font-bold ${v.stock < 5 ? 'text-red-400' : 'text-zinc-500'}`}>
                    {v.stock}{inCart > 0 ? ` (-${inCart})` : ''}
                  </span>
                </div>
              </button>
            );
          })}
          {filtered.length === 0 && <p className="col-span-full text-center text-zinc-500 py-10">No products match "{q}"</p>}
        </div>
      </div>

      {/* Till / cart */}
      <aside className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 h-fit sticky top-4">
        <h3 className="text-lg font-extrabold text-white">🧾 Basket ({itemCount})</h3>
        {cart.length === 0 ? (
          <p className="text-sm text-zinc-500 mt-3">Tap a product to add it to the sale.</p>
        ) : (
          <>
            <ul className="mt-3 divide-y divide-zinc-800 max-h-[40vh] overflow-y-auto">
              {cart.map((l) => (
                <li key={l.variantId} className="py-2 flex gap-2 items-start">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-white truncate">{l.name}</p>
                    <p className="text-[11px] text-zinc-400 truncate">{l.variantLabel}</p>
                    <p className="text-[11px] text-amber-400">{gbp(l.price)} each · {l.stock} in stock</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => changeQty(l.variantId, -1)} className="w-6 h-6 rounded bg-zinc-800 hover:bg-zinc-700 text-white text-sm">−</button>
                    <span className="w-6 text-center text-white text-sm">{l.quantity}</span>
                    <button onClick={() => changeQty(l.variantId, 1)} className="w-6 h-6 rounded bg-zinc-800 hover:bg-zinc-700 text-white text-sm">+</button>
                  </div>
                  <div className="w-16 text-right text-white font-bold text-sm">{gbp(l.price * l.quantity)}</div>
                </li>
              ))}
            </ul>
            <div className="mt-4 space-y-1 text-sm">
              <div className="flex justify-between text-zinc-400"><span>Subtotal</span><span>{gbp(subtotal)}</span></div>
              <div className="flex justify-between items-center text-zinc-400">
                <span>Discount</span>
                <input type="number" min="0" step="0.01" value={discount || ''} onChange={(e) => setDiscount(Number(e.target.value) || 0)}
                  className="w-20 bg-zinc-800 border border-zinc-700 rounded px-2 py-0.5 text-right text-white text-sm" />
              </div>
              <div className="flex justify-between text-white font-extrabold text-lg pt-2 border-t border-zinc-800">
                <span>Total</span><span>{gbp(total)}</span>
              </div>
            </div>
            <div className="mt-4">
              <p className="text-xs text-zinc-400 mb-1 font-semibold">Payment</p>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setPayment('cash')} className={`rounded-lg py-2 font-bold text-sm transition ${payment === 'cash' ? 'bg-amber-400 text-black' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'}`}>💵 Cash</button>
                <button onClick={() => setPayment('card')} className={`rounded-lg py-2 font-bold text-sm transition ${payment === 'card' ? 'bg-teal-500 text-black' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'}`}>💳 Card</button>
              </div>
            </div>
            <input className="input mt-3 text-sm" placeholder="Staff note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
            <button onClick={submit} disabled={loading} className="btn-primary w-full mt-4 bg-amber-400 hover:bg-amber-300 text-black font-black py-3">
              {loading ? 'Recording sale…' : `✓ Record ${payment} sale · ${gbp(total)}`}
            </button>
            <button onClick={() => { setCart([]); setDiscount(0); setNote(''); setResult(null); }} className="w-full mt-2 text-xs text-zinc-500 hover:text-white">Clear basket</button>
          </>
        )}

        {result && 'error' in result && (
          <div className="mt-3 rounded-lg bg-red-900/40 border border-red-500/40 p-3 text-sm text-red-300">❌ {result.error}</div>
        )}
        {result && 'ok' in result && (
          <div className="mt-3 rounded-lg bg-emerald-900/40 border border-emerald-500/40 p-3 text-sm text-emerald-200">
            ✅ Sale recorded as <b>#{result.orderId}</b> · {gbp(result.total)} · Stock updated.
          </div>
        )}
      </aside>
    </div>
  );
}
