'use client';
import { useEffect, useState } from 'react';
import { BRAND, fullAddress } from '@/lib/brand';
import { Logo } from './logo';

export function AgeGate() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const ok = document.cookie.split('; ').find((r) => r.startsWith('vs_age_verified='));
    if (!ok) setOpen(true);
  }, []);
  if (!open) return null;
  const accept = () => {
    document.cookie = 'vs_age_verified=1; path=/; max-age=31536000; samesite=lax';
    localStorage.setItem('vs_age_verified', '1');
    setOpen(false);
  };
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="max-w-md w-full rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-2xl">
        <div className="mx-auto">
          <Logo height={112} className="justify-center" />
        </div>
        <div className="mx-auto mt-4 h-12 w-12 rounded-full bg-amber-400 text-slate-900 font-black text-2xl flex items-center justify-center">18+</div>
        <h1 className="mt-4 text-2xl font-black text-slate-900">Welcome to {BRAND.fullName}</h1>
        <p className="mt-2 text-slate-600 text-sm">
          This website sells nicotine-containing products which are only for adults aged 18 and over.
          Please confirm you are 18 or over to enter.
        </p>
        <p className="mt-3 text-xs text-slate-500">{fullAddress} · Challenge 25 on collection.</p>
        <div className="mt-5 flex gap-2">
          <button onClick={accept} className="flex-1 rounded-xl bg-[#64B5F6] hover:bg-[#4FA3E8] text-slate-900 font-extrabold px-4 py-3 text-sm transition shadow-sm">I am 18 or over</button>
          <a href="https://www.nhs.uk/better-health/quit-smoking/" className="flex-1 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50 transition">Exit</a>
        </div>
      </div>
    </div>
  );
}
