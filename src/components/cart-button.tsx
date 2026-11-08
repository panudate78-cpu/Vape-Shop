'use client';
import { useStore } from '@/lib/store';

export function CartButton() {
  const { setCartOpen, cartCount } = useStore();
  return (
    <button onClick={() => setCartOpen(true)} className="relative rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-800 hover:bg-slate-50 hover:border-[#BBDEFB] transition" aria-label="Cart">
      🛒 Cart
      {cartCount > 0 && (
        <span className="absolute -top-1 -right-1 bg-white border-2 border-[#64B5F6] text-[#64B5F6] text-xs font-bold rounded-full h-5 min-w-5 px-1 grid place-items-center shadow">{cartCount}</span>
      )}
    </button>
  );
}
