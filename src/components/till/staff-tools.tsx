'use client';
import { useCallback, useEffect, useState } from 'react';
import { useStore } from '@/lib/store';
import { gbp } from '@/lib/format';

const ROLE: Record<string, string> = { ADMIN: 'Owner', MANAGER: 'Manager', CASHIER: 'Cashier' };

// Numeric PIN keypad. onSubmit returns an error message, or null when accepted.
export function PinPad({ title, subtitle, submitLabel = 'Confirm', onSubmit, onCancel }: {
  title: string; subtitle?: string; submitLabel?: string;
  onSubmit: (pin: string) => Promise<string | null>; onCancel: () => void;
}) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const press = (k: string) => {
    setError(null);
    if (k === '⌫') return setPin((p) => p.slice(0, -1));
    if (k === 'C') return setPin('');
    setPin((p) => (p.length < 6 ? p + k : p));
  };
  const go = async () => {
    if (pin.length < 4 || busy) return;
    setBusy(true);
    const err = await onSubmit(pin);
    setBusy(false);
    if (err) { setError(err); setPin(''); }
  };
  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-xs rounded-2xl bg-zinc-900 border border-zinc-700 p-5 shadow-2xl">
        <p className="text-lg font-black text-white">{title}</p>
        {subtitle && <p className="text-xs text-zinc-400 mt-1">{subtitle}</p>}
        <div className="mt-4 h-12 rounded-xl bg-zinc-800 flex items-center justify-center text-2xl tracking-[0.4em] text-white font-mono">
          {pin ? '•'.repeat(pin.length) : <span className="text-sm tracking-normal text-zinc-500">Enter PIN</span>}
        </div>
        {error && <p className="mt-2 text-sm font-bold text-red-300">{error}</p>}
        <div className="mt-3 grid grid-cols-3 gap-2">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'].map((k) => (
            <button key={k} onClick={() => press(k)} className="h-14 rounded-xl bg-zinc-800 text-xl font-bold text-white active:scale-95">{k}</button>
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          <button onClick={onCancel} className="flex-1 h-12 rounded-xl bg-zinc-800 text-sm font-bold text-zinc-200">Cancel</button>
          <button onClick={go} disabled={pin.length < 4 || busy} className="flex-1 h-12 rounded-xl bg-amber-400 text-sm font-black text-black disabled:opacity-40">
            {busy ? 'Checking…' : submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

async function jsonFetch(url: string, init?: RequestInit) {
  const res = await fetch(url, init);
  const d = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, d };
}

// Operator line for the till: who is ringing, which register, switch staff, cash drawer.
export function StaffBar({ register, onRegister, cashRequest = 0 }: {
  register: string; onRegister: (r: string) => void; cashRequest?: number; // bump to open the drawer
}) {
  const { user, refreshUser } = useStore();
  const [switching, setSwitching] = useState(false);
  const [cashOpen, setCashOpen] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => { if (cashRequest > 0) setCashOpen(true); }, [cashRequest]);

  const doSwitch = async (pin: string) => {
    const { ok, d } = await jsonFetch('/api/admin/staff/switch', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pin, registerId: register }),
    });
    if (!ok) return d.error || 'Could not switch';
    await refreshUser();
    setSwitching(false);
    setNote(`Now ringing as ${d.user.name}`);
    setTimeout(() => setNote(null), 4000);
    return null;
  };

  return (
    <div className="rounded-2xl bg-zinc-900 border border-zinc-800 px-4 py-3 flex flex-wrap items-center gap-3">
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold">Ringing as</p>
        <p className="text-sm font-black text-white truncate">
          {user ? (user.fullName || user.email) : '—'}
          {user && <span className="ml-2 rounded bg-zinc-800 px-2 py-0.5 text-[10px] font-bold text-amber-300 align-middle">{ROLE[user.role] || user.role}</span>}
        </p>
      </div>
      <button onClick={() => setSwitching(true)} className="h-10 rounded-xl bg-zinc-800 px-3 text-xs font-bold text-white">👤 Switch staff (PIN)</button>
      <label className="flex items-center gap-2 text-xs text-zinc-400">
        Register
        <input value={register} onChange={(e) => onRegister(e.target.value.slice(0, 40))} maxLength={40}
          className="h-10 w-28 rounded-xl bg-zinc-800 px-2 text-sm font-bold text-white" aria-label="Register name" />
      </label>
      <button onClick={() => setCashOpen(true)} className="h-10 rounded-xl bg-amber-400 px-3 text-xs font-black text-black">💷 Cash drawer</button>
      {note && <span className="text-xs font-bold text-emerald-300">{note}</span>}

      {switching && <PinPad title="Staff PIN" subtitle="Enter your PIN to ring sales as yourself." submitLabel="Switch" onSubmit={doSwitch} onCancel={() => setSwitching(false)} />}
      {cashOpen && <CashDrawer register={register} onClose={() => setCashOpen(false)} />}
    </div>
  );
}

// Cash drawer: open the shift with a float, paid in/out, and the end-of-day count.
// Cashiers count blind. Expected cash is shown only to managers and owners, or after closing.
export function CashDrawer({ register, onClose }: { register: string; onClose: () => void }) {
  const [state, setState] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [float, setFloat] = useState('');
  const [kind, setKind] = useState<'paid_in' | 'paid_out'>('paid_out');
  const [amt, setAmt] = useState('');
  const [reason, setReason] = useState('');
  const [counted, setCounted] = useState('');
  const [cNote, setCNote] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { ok, d } = await jsonFetch(`/api/admin/cash?register=${encodeURIComponent(register)}`);
    if (ok) setState(d);
    else setMsg({ kind: 'err', text: d.error || 'Could not load the drawer' });
    setLoading(false);
  }, [register]);
  useEffect(() => { load(); }, [load]);

  const act = async (body: any, okText: (d: any) => string) => {
    setBusy(true); setMsg(null);
    const { ok, d } = await jsonFetch('/api/admin/cash', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ register, ...body }) });
    setBusy(false);
    if (!ok) { setMsg({ kind: 'err', text: d.error || 'Failed' }); return false; }
    setMsg({ kind: 'ok', text: okText(d) });
    if (body.action !== 'close') await load();
    return true;
  };

  const open = state?.shift;
  const seesExpected = state && state.expected !== undefined;
  const variance = (counted !== '' && seesExpected) ? Math.round((Number(counted) - state.expected) * 100) / 100 : null;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-zinc-900 border border-zinc-700 p-5 shadow-2xl space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-lg font-black text-white">Cash drawer · {register}</p>
          <button onClick={onClose} className="h-9 px-3 rounded-lg bg-zinc-800 text-sm font-bold text-zinc-200">Close</button>
        </div>
        {loading && <p className="text-sm text-zinc-400">Loading…</p>}
        {msg && <div className={`rounded-xl px-3 py-2 text-sm font-bold ${msg.kind === 'ok' ? 'bg-emerald-900/40 text-emerald-200' : 'bg-red-900/40 text-red-200'}`}>{msg.text}</div>}

        {!loading && !open && (
          <div className="rounded-xl bg-zinc-800 p-4 space-y-3">
            <p className="text-sm text-zinc-300">No shift is open on this till. Count the opening float, then open.</p>
            <label className="block text-xs text-zinc-400">Opening float (£)
              <input inputMode="decimal" value={float} onChange={(e) => setFloat(e.target.value)} className="mt-1 h-12 w-full rounded-xl bg-zinc-900 px-3 text-lg font-bold text-white" />
            </label>
            <button disabled={busy || float === ''} onClick={() => act({ action: 'open', openingFloat: Number(float) }, () => 'Till opened. Cash sales can now be taken.')}
              className="h-12 w-full rounded-xl bg-amber-400 font-black text-black disabled:opacity-40">Open till</button>
          </div>
        )}

        {!loading && open && (
          <>
            <div className="rounded-xl bg-zinc-800 p-4 text-sm text-zinc-300 space-y-1">
              <p>Opened by <b className="text-white">{open.openedByName}</b> at {new Date(open.openedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} with a float of <b className="text-white">{gbp(open.openingFloat)}</b></p>
              <p>{state.breakdown?.salesCount ?? 0} sales · {state.breakdown?.refundsCount ?? 0} refunds today on this till</p>
              {seesExpected && state.breakdown && (
                <p className="text-xs text-zinc-400">
                  Cash sales {gbp(state.breakdown.cashSales)} · cash refunds {gbp(Math.abs(state.breakdown.cashRefunds))} · paid in {gbp(state.breakdown.paidIn)} · paid out {gbp(state.breakdown.paidOut)}
                </p>
              )}
              {seesExpected && <p className="text-base font-black text-white">Expected in drawer: {gbp(state.expected)}</p>}
            </div>

            <div className="rounded-xl bg-zinc-800 p-4 space-y-2">
              <p className="text-xs font-bold uppercase tracking-wider text-zinc-400">Paid in / paid out</p>
              <div className="flex gap-2">
                <select value={kind} onChange={(e) => setKind(e.target.value as any)} className="h-11 rounded-xl bg-zinc-900 px-2 text-sm font-bold text-white">
                  <option value="paid_out">Paid out</option><option value="paid_in">Paid in</option>
                </select>
                <input inputMode="decimal" placeholder="£" value={amt} onChange={(e) => setAmt(e.target.value)} className="h-11 w-24 rounded-xl bg-zinc-900 px-3 text-sm font-bold text-white" />
              </div>
              <input placeholder="Reason (e.g. milk, bin bags, change from bank)" value={reason} onChange={(e) => setReason(e.target.value)} className="h-11 w-full rounded-xl bg-zinc-900 px-3 text-sm text-white" />
              <button disabled={busy || !amt || reason.trim().length < 3}
                onClick={async () => { if (await act({ action: 'paid', kind, amount: Number(amt), reason: reason.trim() }, () => 'Recorded.')) { setAmt(''); setReason(''); } }}
                className="h-11 w-full rounded-xl bg-zinc-700 font-bold text-white disabled:opacity-40">Record</button>
              {state.movements?.length > 0 && (
                <ul className="text-xs text-zinc-400 space-y-1 pt-2">
                  {state.movements.slice(0, 8).map((m: any) => (
                    <li key={m.id}>{m.kind === 'paid_in' ? 'In' : 'Out'} {gbp(Number(m.amount))} · {m.reason} · {m.staffName}</li>
                  ))}
                </ul>
              )}
            </div>

            <div className="rounded-xl bg-zinc-800 p-4 space-y-2">
              <p className="text-xs font-bold uppercase tracking-wider text-zinc-400">End of day: cash up</p>
              <p className="text-xs text-zinc-500">Count the drawer first, then enter the total.</p>
              <input inputMode="decimal" placeholder="Counted cash £" value={counted} onChange={(e) => setCounted(e.target.value)} className="h-12 w-full rounded-xl bg-zinc-900 px-3 text-lg font-bold text-white" />
              {variance !== null && variance !== 0 && <p className="text-sm font-bold text-amber-300">{variance > 0 ? `${gbp(variance)} over` : `${gbp(Math.abs(variance))} short`}: add a note.</p>}
              <textarea placeholder="Discrepancy note (required if counted ≠ expected)" value={cNote} onChange={(e) => setCNote(e.target.value)} rows={2} className="w-full rounded-xl bg-zinc-900 px-3 py-2 text-sm text-white" />
              <button disabled={busy || counted === ''}
                onClick={async () => {
                  const ok = await act({ action: 'close', countedCash: Number(counted), note: cNote.trim() || undefined }, (d) => `Till closed. Expected ${gbp(d.expected)}, counted ${gbp(d.counted)}, ${d.variance === 0 ? 'no discrepancy.' : `${gbp(Math.abs(d.variance))} ${d.variance > 0 ? 'over' : 'short'} (noted).`}`);
                  if (ok) { setCounted(''); setCNote(''); setState(null); await load(); }
                }}
                className="h-12 w-full rounded-xl bg-amber-400 font-black text-black disabled:opacity-40">Close till and cash up</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
