'use client';
// Generic add-to-cart — expects the full variant object via data attribute pattern.
// Kept for backwards compatibility; the homepage uses addToCart directly from useStore.
export function AddToCartButton({ disabled, children, onClick }: { disabled?: boolean; children: React.ReactNode; onClick?: () => void }) {
  return (
    <button onClick={onClick} disabled={disabled} className={`w-full rounded-xl px-4 py-2.5 text-sm font-extrabold ${disabled ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-slate-900 text-white hover:bg-black'}`}>
      {children}
    </button>
  );
}
