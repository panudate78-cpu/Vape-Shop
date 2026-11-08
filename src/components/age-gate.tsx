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
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="max-w-md w-full rounded-2xl border border-teal-500/40 bg-zinc-900 p-6 text-center">
        <div className="mx-auto">
          <Logo height={128} className="justify-center" />
        </div>
        <div className="mx-auto mt-4 h-12 w-12 rounded-full bg-teal-500 text-zinc-950 font-black text-2xl flex items-center justify-center">18+</div>
        <h1 className="mt-4 text-2xl font-black text-white">Welcome to {BRAND.fullName}</h1>
        <p className="mt-2 text-zinc-400 text-sm">
          This website sells nicotine-containing products which are only for adults aged 18 and over.
          Please confirm you are 18 or over to enter.
        </p>
        <p className="mt-3 text-xs text-zinc-500">{fullAddress} · Challenge 25 on collection.</p>
        <div className="mt-5 flex gap-2">
          <button onClick={accept} className="flex-1 rounded-xl bg-teal-500 hover:bg-teal-400 text-black font-extrabold px-4 py-3 text-sm">I am 18 or over</button>
          <a href="https://www.nhs.uk/better-health/quit-smoking/" className="flex-1 rounded-xl border border-white/15 px-4 py-3 text-sm font-bold text-white hover:bg-white/5">Exit</a>
        </div>
      </div>
    </div>
  );
}
