'use client';
import { useEffect, useState } from 'react';

type Cat = { id: number; name: string; slug: string; description: string | null };

export default function AdminCategoriesPage() {
  const [rows, setRows] = useState<Cat[]>([]);
  const [form, setForm] = useState({ name: '', slug: '', description: '' });
  const [editing, setEditing] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');

  const load = async () => {
    const r = await fetch('/api/admin/categories', { cache: 'no-store' });
    setRows(await r.json());
  };
  useEffect(() => { load(); }, []);

  const slugify = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  const save = async () => {
    if (!form.name.trim()) { setMsg('Name is required.'); return; }
    setLoading(true); setMsg('');
    const payload = {
      name: form.name.trim(),
      slug: form.slug.trim() || slugify(form.name),
      description: form.description.trim(),
    };
    const url = editing ? `/api/admin/categories/${editing}` : '/api/admin/categories';
    const method = editing ? 'PATCH' : 'POST';
    const r = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
    const j = await r.json();
    setLoading(false);
    if (!r.ok) { setMsg(j.error || 'Save failed'); return; }
    setForm({ name: '', slug: '', description: '' });
    setEditing(null);
    setMsg(editing ? 'Category updated.' : 'Category added.');
    load();
  };

  const del = async (id: number) => {
    if (!confirm('Delete this category? Products in it will be moved to "Uncategorized".')) return;
    const r = await fetch(`/api/admin/categories/${id}`, { method: 'DELETE' });
    if (r.ok) { setMsg('Deleted.'); load(); }
    else setMsg('Delete failed.');
  };

  const startEdit = (c: Cat) => {
    setEditing(c.id);
    setForm({ name: c.name, slug: c.slug, description: c.description || '' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
      <div className="rounded-2xl border border-white/10 bg-zinc-900 p-5 space-y-3 h-fit">
        <h2 className="text-lg font-black text-white">{editing ? 'Edit category' : 'Add category'}</h2>
        <label className="block text-xs font-bold text-zinc-300">Name *
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Disposables"
            className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm outline-none" />
        </label>
        <label className="block text-xs font-bold text-zinc-300">Slug (URL segment)
          <input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="auto-generated if blank"
            className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm outline-none font-mono" />
        </label>
        <label className="block text-xs font-bold text-zinc-300">Description
          <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3}
            placeholder="Short optional blurb shown on category tiles"
            className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm outline-none" />
        </label>
        {msg && <p className="text-xs text-teal-300">{msg}</p>}
        <div className="flex gap-2">
          <button disabled={loading} onClick={save} className="rounded-xl bg-amber-400 hover:bg-amber-300 text-black font-extrabold px-4 py-2 text-sm disabled:opacity-50">
            {loading ? 'Saving…' : (editing ? 'Save changes' : '+ Add category')}
          </button>
          {editing && (
            <button onClick={() => { setEditing(null); setForm({ name: '', slug: '', description: '' }); setMsg(''); }}
              className="rounded-xl border border-white/15 px-4 py-2 text-sm font-bold text-white">Cancel</button>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-zinc-900 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-zinc-800/50 text-left"><tr>
            <th className="p-3">Name</th>
            <th className="p-3">Slug</th>
            <th className="p-3 hidden md:table-cell">Description</th>
            <th className="p-3"></th>
          </tr></thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} className="border-t border-zinc-800">
                <td className="p-3 font-semibold text-white">{c.name}</td>
                <td className="p-3 font-mono text-xs text-zinc-400">/{c.slug}</td>
                <td className="p-3 text-zinc-400 hidden md:table-cell">{c.description || '—'}</td>
                <td className="p-3 text-right space-x-2">
                  <button onClick={() => startEdit(c)} className="text-teal-300 underline text-xs">Edit</button>
                  <button onClick={() => del(c.id)} className="text-red-400 underline text-xs">Delete</button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={4} className="p-6 text-center text-zinc-500">No categories yet — add your first one.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
