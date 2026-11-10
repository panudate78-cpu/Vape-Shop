'use client';
import { useState } from 'react';

type Decision = { result: 'passed'; idType?: string; appearsOver25?: boolean } | { result: 'refused'; reasonCode: string; note?: string };

// Challenge 25 at the till. Shown before payment whenever the basket has an age-restricted item.
// The decision is recorded on the server with the staff member's name and the time.
export function AgeCheckModal({ prompts, idTypes, reasons, onDecide }: {
  prompts: string[];
  idTypes: Record<string, string>;
  reasons: Record<string, string>;
  onDecide: (d: Decision | null) => void;
}) {
  const [idType, setIdType] = useState('');
  const [over25, setOver25] = useState(false);
  const [refusing, setRefusing] = useState(false);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const canConfirm = !!idType || over25;
  const canRefuse = !!reason && (reason !== 'other' || note.trim().length > 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-label="Age check">
      <div className="w-full max-w-lg rounded-2xl border border-amber-400/40 bg-zinc-900 p-5 space-y-4">
        <div>
          <h2 className="text-xl font-black text-amber-300">Age check · 18+ only</h2>
          <p className="text-xs text-zinc-400">Ask for photo ID if the customer looks under 25 (Challenge 25).</p>
        </div>
        <ul className="space-y-2 rounded-xl bg-zinc-950 p-3 text-sm text-zinc-100">
          {prompts.map((p, i) => <li key={i} className="flex gap-2"><span className="text-amber-400">•</span><span>{p}</span></li>)}
        </ul>

        {!refusing && (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-bold text-zinc-300 mb-1">ID shown</label>
              <select className="input !text-sm w-full" value={idType} disabled={over25} onChange={(e) => { setIdType(e.target.value); setOver25(false); }}>
                <option value="">Choose the ID…</option>
                {Object.entries(idTypes).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
              </select>
            </div>
            <label className="flex items-center gap-3 rounded-xl bg-zinc-800 px-3 py-3 text-sm font-bold text-zinc-100">
              <input type="checkbox" className="h-5 w-5" checked={over25} onChange={(e) => { setOver25(e.target.checked); if (e.target.checked) setIdType(''); }} />
              Customer clearly appears over 25 (no ID asked)
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button disabled={!canConfirm} onClick={() => onDecide({ result: 'passed', ...(over25 ? { appearsOver25: true } : { idType }) })}
                className="rounded-xl bg-emerald-500 py-4 font-black text-black disabled:opacity-40">Confirm 18+ · continue</button>
              <button onClick={() => setRefusing(true)} className="rounded-xl bg-red-500 py-4 font-black text-white">Refuse sale</button>
            </div>
            <button onClick={() => onDecide(null)} className="w-full rounded-xl bg-zinc-800 py-3 text-sm font-bold text-zinc-300">Cancel sale</button>
          </div>
        )}

        {refusing && (
          <div className="space-y-3">
            <p className="text-sm font-bold text-red-300">Refuse this sale? The refusal is logged with your name, the time and the reason.</p>
            <select className="input !text-sm w-full" value={reason} onChange={(e) => setReason(e.target.value)}>
              <option value="">Choose a reason…</option>
              {Object.entries(reasons).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
            </select>
            <input className="input !text-sm w-full" placeholder={reason === 'other' ? 'Note (required)' : 'Note (optional)'} value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setRefusing(false)} className="rounded-xl bg-zinc-800 py-4 font-bold text-zinc-200">Back</button>
              <button disabled={!canRefuse} onClick={() => onDecide({ result: 'refused', reasonCode: reason, note: note.trim() || undefined })}
                className="rounded-xl bg-red-500 py-4 font-black text-white disabled:opacity-40">Log refusal</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
