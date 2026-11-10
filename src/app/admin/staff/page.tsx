'use client';
import { useCallback, useEffect, useState } from 'react';
import { useStore } from '@/lib/store';

type Staff = { id: number; email: string; fullName: string | null; role: string; active: boolean; hasPin: boolean; createdAt: string };
type Entry = { id: number; at: string; actorName: string | null; actorRole: string | null; registerId: string | null; action: string; entity: string | null; entityId: string | null; detail: any };

const ROLE_LABEL: Record<string, string> = { ADMIN: 'Owner', MANAGER: 'Manager', CASHIER: 'Cashier' };
const ACTIONS = ['refund.create', 'discount.apply', 'discount.override', 'price.change', 'stock.adjust', 'stocktake.complete', 'batch.recall', 'cash.open', 'cash.paid_in', 'cash.paid_out', 'cash.close', 'staff.create', 'staff.update', 'staff.switch', 'export.run', 'import.run', 'product.archive', 'product.restore', 'product.delete', 'category.delete'];
const field = 'h-10 rounded-xl bg-zinc-900 border border-zinc-700 px-3 text-sm text-white';

export default function StaffPage() {
  const { user } = useStore();
  const owner = user?.role === 'ADMIN';
  const [tab, setTab] = useState<'staff' | 'audit'>('staff');
  useEffect(() => { if (user) setTab(owner ? 'staff' : 'audit'); }, [user?.role]);
  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {owner && <button onClick={() => setTab('staff')} className={`rounded-xl px-4 py-2 text-sm font-bold ${tab === 'staff' ? 'bg-amber-400 text-black' : 'bg-white/5 text-zinc-300'}`}>Staff accounts</button>}
        <button onClick={() => setTab('audit')} className={`rounded-xl px-4 py-2 text-sm font-bold ${tab === 'audit' ? 'bg-amber-400 text-black' : 'bg-white/5 text-zinc-300'}`}>Audit log</button>
      </div>
      {tab === 'staff' && owner && <StaffTab />}
      {tab === 'audit' && <AuditTab />}
    </div>
  );
}

function StaffTab() {
  const [rows, setRows] = useState<Staff[]>([]);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [form, setForm] = useState({ fullName: '', email: '', role: 'CASHIER', password: '', pin: '' });
  const load = useCallback(async () => {
    const d = await fetch('/api/admin/staff').then((r) => r.json());
    setRows(d.staff || []);
  }, []);
  useEffect(() => { load(); }, [load]);

  const send = async (method: string, body: any, okText: string) => {
    const res = await fetch('/api/admin/staff', { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) { setMsg({ kind: 'err', text: d.error || 'Failed' }); return false; }
    setMsg({ kind: 'ok', text: okText });
    await load();
    return true;
  };

  return (
    <div className="space-y-4">
      {msg && <div className={`rounded-xl px-4 py-2 text-sm font-bold ${msg.kind === 'ok' ? 'bg-emerald-900/40 text-emerald-200' : 'bg-red-900/40 text-red-200'}`}>{msg.text}</div>}

      <section className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4">
        <p className="font-black text-white">Add a staff member</p>
        <p className="text-xs text-zinc-400 mt-1">Owner = full access. Manager = refunds, discount approval, stock, cash reports, exports. Cashier = the till only. Refunds and large discounts need a manager PIN.</p>
        <div className="mt-3 grid gap-2 md:grid-cols-6">
          <input className={field} placeholder="Full name" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
          <input className={field} placeholder="Email (login)" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <select className={field} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            <option value="CASHIER">Cashier</option><option value="MANAGER">Manager</option><option value="ADMIN">Owner</option>
          </select>
          <input className={field} type="password" placeholder="Password (8+)" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          <input className={field} inputMode="numeric" placeholder="Till PIN (4–6 digits)" value={form.pin} onChange={(e) => setForm({ ...form, pin: e.target.value.replace(/\D/g, '').slice(0, 6) })} />
          <button className="h-10 rounded-xl bg-amber-400 px-4 text-sm font-black text-black"
            onClick={async () => {
              const ok = await send('POST', { ...form, pin: form.pin || undefined }, 'Staff member added.');
              if (ok) setForm({ fullName: '', email: '', role: 'CASHIER', password: '', pin: '' });
            }}>Add</button>
        </div>
      </section>

      <section className="rounded-2xl bg-zinc-900 border border-zinc-800 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wider text-zinc-500">
            <tr><th className="p-3">Name</th><th className="p-3">Email</th><th className="p-3">Role</th><th className="p-3">Till PIN</th><th className="p-3">Active</th><th className="p-3">Actions</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-zinc-800 text-zinc-200">
                <td className="p-3 font-bold text-white">{r.fullName || '—'}</td>
                <td className="p-3">{r.email}</td>
                <td className="p-3">
                  <select className={field} value={r.role} onChange={(e) => send('PATCH', { id: r.id, role: e.target.value }, 'Role updated.')}>
                    <option value="CASHIER">Cashier</option><option value="MANAGER">Manager</option><option value="ADMIN">Owner</option>
                  </select>
                </td>
                <td className="p-3">
                  {r.hasPin ? <span className="text-emerald-300 text-xs font-bold">Set</span> : <span className="text-zinc-500 text-xs">Not set</span>}
                  <PinSetter onSave={(pin) => send('PATCH', { id: r.id, pin }, 'PIN saved.')} />
                  {r.hasPin && <button className="ml-2 text-xs text-zinc-400 underline" onClick={() => send('PATCH', { id: r.id, clearPin: true }, 'PIN removed.')}>remove</button>}
                </td>
                <td className="p-3">
                  <button onClick={() => send('PATCH', { id: r.id, active: !r.active }, r.active ? 'Account disabled.' : 'Account enabled.')}
                    className={`rounded-lg px-3 py-1 text-xs font-bold ${r.active ? 'bg-emerald-900/50 text-emerald-200' : 'bg-zinc-800 text-zinc-400'}`}>{r.active ? 'Active' : 'Disabled'}</button>
                </td>
                <td className="p-3">
                  <PasswordSetter onSave={(password) => send('PATCH', { id: r.id, password }, 'Password reset.')} />
                </td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={6} className="p-6 text-center text-zinc-500">No staff accounts yet.</td></tr>}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function PinSetter({ onSave }: { onSave: (pin: string) => Promise<boolean> }) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState('');
  if (!open) return <button className="ml-2 text-xs font-bold text-amber-300 underline" onClick={() => setOpen(true)}>set</button>;
  return (
    <span className="ml-2 inline-flex gap-1">
      <input className="h-8 w-24 rounded-lg bg-zinc-900 border border-zinc-700 px-2 text-xs text-white" inputMode="numeric" placeholder="4–6 digits" value={v} onChange={(e) => setV(e.target.value.replace(/\D/g, '').slice(0, 6))} />
      <button className="h-8 rounded-lg bg-amber-400 px-2 text-xs font-black text-black" disabled={v.length < 4} onClick={async () => { if (await onSave(v)) { setOpen(false); setV(''); } }}>Save</button>
      <button className="h-8 px-1 text-xs text-zinc-400" onClick={() => { setOpen(false); setV(''); }}>×</button>
    </span>
  );
}

function PasswordSetter({ onSave }: { onSave: (pw: string) => Promise<boolean> }) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState('');
  if (!open) return <button className="text-xs font-bold text-zinc-300 underline" onClick={() => setOpen(true)}>reset password</button>;
  return (
    <span className="inline-flex gap-1">
      <input type="password" className="h-8 w-32 rounded-lg bg-zinc-900 border border-zinc-700 px-2 text-xs text-white" placeholder="New password (8+)" value={v} onChange={(e) => setV(e.target.value)} />
      <button className="h-8 rounded-lg bg-amber-400 px-2 text-xs font-black text-black" disabled={v.length < 8} onClick={async () => { if (await onSave(v)) { setOpen(false); setV(''); } }}>Save</button>
      <button className="h-8 px-1 text-xs text-zinc-400" onClick={() => { setOpen(false); setV(''); }}>×</button>
    </span>
  );
}

function AuditTab() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [action, setAction] = useState('');
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    const d = await fetch(`/api/admin/audit?limit=200${action ? `&action=${encodeURIComponent(action)}` : ''}`).then((r) => r.json());
    setEntries(d.entries || []);
    setLoading(false);
  }, [action]);
  useEffect(() => { load(); }, [load]);
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <select className={field} value={action} onChange={(e) => setAction(e.target.value)}>
          <option value="">All actions</option>
          {ACTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <button className="h-10 rounded-xl bg-white/5 px-3 text-sm font-bold text-zinc-200" onClick={load}>Refresh</button>
        <span className="text-xs text-zinc-500">Newest first · read-only record</span>
      </div>
      <div className="rounded-2xl bg-zinc-900 border border-zinc-800 overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-left uppercase tracking-wider text-zinc-500">
            <tr><th className="p-2">When</th><th className="p-2">Who</th><th className="p-2">Register</th><th className="p-2">Action</th><th className="p-2">Item</th><th className="p-2">Detail</th></tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id} className="border-t border-zinc-800 align-top text-zinc-300">
                <td className="p-2 whitespace-nowrap">{new Date(e.at).toLocaleString('en-GB')}</td>
                <td className="p-2">{e.actorName || 'system'} <span className="text-zinc-500">{e.actorRole ? ROLE_LABEL[e.actorRole] || e.actorRole : ''}</span></td>
                <td className="p-2">{e.registerId || '—'}</td>
                <td className="p-2 font-bold text-amber-300">{e.action}</td>
                <td className="p-2">{e.entity ? `${e.entity} ${e.entityId ?? ''}` : '—'}</td>
                <td className="p-2 font-mono text-[11px] text-zinc-400 max-w-md break-all">{e.detail && Object.keys(e.detail).length ? JSON.stringify(e.detail) : '—'}</td>
              </tr>
            ))}
            {!loading && !entries.length && <tr><td colSpan={6} className="p-6 text-center text-zinc-500">Nothing recorded yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
