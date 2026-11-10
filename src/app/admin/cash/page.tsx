'use client';
import { useEffect, useState } from 'react';
import { gbp } from '@/lib/format';

type Shift = {
  id: number; register: string; status: string; openedByName: string | null; openedAt: string; openingFloat: string;
  closedByName: string | null; closedAt: string | null; expectedCash: string | null; countedCash: string | null;
  variance: string | null; discrepancyNote: string | null;
};

// Manager and owner: every till shift, with the expected vs counted figures and any discrepancy notes.
export default function CashPage() {
  const [shifts, setShifts] = useState<Shift[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    fetch('/api/admin/cash?history=1').then(async (r) => {
      const d = await r.json();
      if (!r.ok) setErr(d.error || 'Could not load');
      else setShifts(d.shifts || []);
    });
  }, []);
  if (err) return <div className="rounded-xl bg-red-900/40 p-4 text-sm font-bold text-red-200">{err}</div>;
  if (!shifts) return <div className="text-zinc-400 text-sm">Loading shifts…</div>;
  return (
    <section className="space-y-3">
      <p className="text-xs text-zinc-500">Expected = opening float + cash takings − cash refunds + paid in − paid out. Card takings are not in the drawer.</p>
      <div className="rounded-2xl bg-zinc-900 border border-zinc-800 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wider text-zinc-500">
            <tr><th className="p-3">Register</th><th className="p-3">Opened</th><th className="p-3">Float</th><th className="p-3">Closed</th><th className="p-3">Expected</th><th className="p-3">Counted</th><th className="p-3">Variance</th><th className="p-3">Note</th></tr>
          </thead>
          <tbody>
            {shifts.map((s) => {
              const v = s.variance == null ? null : Number(s.variance);
              return (
                <tr key={s.id} className="border-t border-zinc-800 text-zinc-200 align-top">
                  <td className="p-3 font-bold text-white">{s.register}{s.status === 'open' && <span className="ml-2 rounded bg-emerald-900/60 px-2 py-0.5 text-[10px] font-bold text-emerald-200">OPEN</span>}</td>
                  <td className="p-3 whitespace-nowrap">{new Date(s.openedAt).toLocaleString('en-GB')}<br /><span className="text-xs text-zinc-500">{s.openedByName}</span></td>
                  <td className="p-3">{gbp(Number(s.openingFloat))}</td>
                  <td className="p-3 whitespace-nowrap">{s.closedAt ? <>{new Date(s.closedAt).toLocaleString('en-GB')}<br /><span className="text-xs text-zinc-500">{s.closedByName}</span></> : '—'}</td>
                  <td className="p-3">{s.expectedCash != null ? gbp(Number(s.expectedCash)) : '—'}</td>
                  <td className="p-3">{s.countedCash != null ? gbp(Number(s.countedCash)) : '—'}</td>
                  <td className={`p-3 font-bold ${v == null ? '' : v === 0 ? 'text-emerald-300' : 'text-amber-300'}`}>{v == null ? '—' : v === 0 ? 'Balanced' : `${v > 0 ? '+' : '−'}${gbp(Math.abs(v))}`}</td>
                  <td className="p-3 text-xs text-zinc-400 max-w-xs">{s.discrepancyNote || '—'}</td>
                </tr>
              );
            })}
            {!shifts.length && <tr><td colSpan={8} className="p-6 text-center text-zinc-500">No shifts yet. Open a till from the Till screen.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
