'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

type Cat = { id: number; name: string };
export default function NewProductPage() {
  const router = useRouter();
  const [cats, setCats] = useState<Cat[]>([]);
  const [name, setName] = useState(''); const [brand, setBrand] = useState('');
  const [categoryId, setCategoryId] = useState<number | ''>('');
  const [description, setDescription] = useState('');
  const [basePrice, setBasePrice] = useState('');
  const [vgpg, setVgpg] = useState('70/30');
  const [flavor, setFlavor] = useState('');
  const [variants, setVariants] = useState<Array<{ flavor: string; nic: string; size: string; price: string; stock: string }>>([{ flavor: '', nic: '0mg', size: '10ml', price: '', stock: '0' }]);
  const [err, setErr] = useState<string | null>(null); const [loading, setLoading] = useState(false);

  useEffect(() => { fetch('/api/categories').then((r) => r.json()).then(setCats); }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true); setErr(null);
    const r = await fetch('/api/admin/products', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name, brand, categoryId: Number(categoryId), description, basePrice: Number(basePrice),
        vgPgRatio: vgpg, flavorProfile: flavor,
        variants: variants.map((v) => ({ flavor: v.flavor, nicotineStrength: v.nic, bottleSize: v.size, priceOverride: v.price ? Number(v.price) : null, stockQuantity: Number(v.stock || 0) })),
      }),
    });
    setLoading(false);
    if (!r.ok) { const d = await r.json(); setErr(d.error || 'Failed'); return; }
    router.push('/admin/products');
  };
  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-amber-400">New product</h1>
      <form onSubmit={submit} className="card space-y-3 mt-4">
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">Name</label><input className="input" required value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div><label className="label">Brand</label><input className="input" required value={brand} onChange={(e) => setBrand(e.target.value)} /></div>
        </div>
        <div><label className="label">Category</label>
          <select className="input" required value={categoryId} onChange={(e) => setCategoryId(Number(e.target.value))}>
            <option value="">Choose…</option>
            {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div><label className="label">Description</label><textarea className="input min-h-[80px]" value={description} onChange={(e) => setDescription(e.target.value)} /></div>
        <div className="grid grid-cols-3 gap-3">
          <div><label className="label">Base price £</label><input className="input" type="number" step="0.01" required value={basePrice} onChange={(e) => setBasePrice(e.target.value)} /></div>
          <div><label className="label">VG/PG</label><input className="input" value={vgpg} onChange={(e) => setVgpg(e.target.value)} /></div>
          <div><label className="label">Flavor profile</label><input className="input" value={flavor} onChange={(e) => setFlavor(e.target.value)} /></div>
        </div>
        <div>
          <div className="label">Variants (Flavor × Nic × Size matrix)</div>
          <div className="space-y-2">
            {variants.map((v, i) => (
              <div key={i} className="grid grid-cols-5 gap-2">
                <input className="input col-span-2" placeholder="Flavor" value={v.flavor} onChange={(e) => { const c = [...variants]; c[i].flavor = e.target.value; setVariants(c); }} />
                <input className="input" placeholder="Nic (e.g. 20mg)" value={v.nic} onChange={(e) => { const c = [...variants]; c[i].nic = e.target.value; setVariants(c); }} />
                <input className="input" placeholder="Size" value={v.size} onChange={(e) => { const c = [...variants]; c[i].size = e.target.value; setVariants(c); }} />
                <input className="input" type="number" step="0.01" placeholder="£" value={v.price} onChange={(e) => { const c = [...variants]; c[i].price = e.target.value; setVariants(c); }} />
                <input className="input col-span-1" type="number" placeholder="Stock" value={v.stock} onChange={(e) => { const c = [...variants]; c[i].stock = e.target.value; setVariants(c); }} />
              </div>
            ))}
            <button type="button" className="btn-outline text-sm" onClick={() => setVariants([...variants, { flavor: '', nic: '0mg', size: '10ml', price: '', stock: '0' }])}>+ Add variant</button>
          </div>
        </div>
        {err && <div className="text-red-400 text-sm">{err}</div>}
        <button className="btn-amber w-full" disabled={loading}>{loading ? 'Creating…' : 'Create product'}</button>
      </form>
    </div>
  );
}
