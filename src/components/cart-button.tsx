'use client';
import { useStore } from '@/lib/store';

export function CartButton() {
  const { setCartOpen, cartCount } = useStore();
  return (
    <button onClick={() => setCartOpen(true)} className="relative rounded-xl border border-white/15 px-3 py-2 text-sm font-bold hover:bg-white/5" aria-label="Cart">
      🛒 Cart
      {cartCount > 0 && (
        <span className="absolute -top-1 -right-1 bg-teal-400 text-zinc-950 text-xs font-bold rounded-full h-5 min-w-5 px-1 grid place-items-center">{cartCount}</span>
      )}
    </button>
  );
}
