'use client';
// Generic add-to-cart — expects the full variant object via data attribute pattern.
// Kept for backwards compatibility; the homepage uses addToCart directly from useStore.
export function AddToCartButton({ disabled, children, onClick }: { disabled?: boolean; children: React.ReactNode; onClick?: () => void }) {
  return (
    <button onClick={onClick} disabled={disabled} className={`w-full rounded-xl px-4 py-2.5 text-sm font-extrabold ${disabled ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-white border-2 border-[#64B5F6] text-[#64B5F6] hover:bg-[#64B5F6] hover:text-white'}`}>
      {children}
    </button>
  );
}
