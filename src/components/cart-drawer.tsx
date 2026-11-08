'use client';
import Link from 'next/link';
import { useStore } from '@/lib/store';
import { gbp } from '@/lib/format';
import { PlaceholderImage } from './placeholder-image';

export function CartDrawer() {
  const { cart, cartOpen, setCartOpen, removeFromCart, setQuantity, cartSubtotal } = useStore();
  if (!cartOpen) return null;
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/70" onClick={() => setCartOpen(false)} />
      <aside className="absolute right-0 top-0 h-full w-full max-w-md bg-zinc-950 border-l border-white/10 p-5 overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-extrabold text-white">Your Cart ({cart.reduce((s, l) => s + l.quantity, 0)})</h2>
          <button onClick={() => setCartOpen(false)} className="text-zinc-400 hover:text-white">Close ✕</button>
        </div>
        {cart.length === 0 ? (
          <p className="text-zinc-500">Your cart is empty.</p>
        ) : (
          <>
            <ul className="space-y-3">
              {cart.map((i) => (
                <li key={i.lineId} className="flex gap-3 border-b border-white/10 pb-3">
                  <div className="h-16 w-16 flex-shrink-0 rounded-lg overflow-hidden bg-zinc-800">
                    {i.image ? <PlaceholderImage src={i.image} alt="" className="h-full w-full object-cover" /> : <div className="h-full w-full grid place-items-center text-2xl">☁️</div>}
                  </div>
                  <div className="flex-1">
                    <div className="font-bold text-white text-sm">{i.name}</div>
                    <div className="text-xs text-zinc-400">{i.variantLabel} · {i.sku}</div>
                    <div className="mt-2 flex items-center gap-2">
                      <button onClick={() => setQuantity(i.lineId, i.quantity - 1)} className="w-7 h-7 rounded bg-zinc-800 hover:bg-zinc-700">−</button>
                      <span className="text-sm">{i.quantity}</span>
                      <button onClick={() => setQuantity(i.lineId, i.quantity + 1)} className="w-7 h-7 rounded bg-zinc-800 hover:bg-zinc-700">+</button>
                      <button onClick={() => removeFromCart(i.lineId)} className="ml-auto text-xs text-red-400 hover:text-red-300">Remove</button>
                    </div>
                  </div>
                  <div className="text-right font-bold text-white">{gbp(i.unitPrice * i.quantity)}</div>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex justify-between font-bold text-white">
              <span>Subtotal</span><span>{gbp(cartSubtotal)}</span>
            </div>
            <Link href="/checkout" onClick={() => setCartOpen(false)} className="rounded-xl bg-teal-500 hover:bg-teal-400 text-black font-extrabold px-4 py-3 w-full mt-4 inline-block text-center">Checkout</Link>
            <p className="text-xs text-zinc-500 mt-3">Shipping calculated at checkout. 18+ only — age verification required.</p>
          </>
        )}
      </aside>
    </div>
  );
}
