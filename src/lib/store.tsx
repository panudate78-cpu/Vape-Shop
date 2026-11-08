'use client';
import { createContext, useContext, useEffect, useMemo, useState, useCallback, type ReactNode } from 'react';

export type User = {
  id: number; email: string; role: 'CUSTOMER' | 'ADMIN' | string; fullName?: string;
};

export type CartLine = {
  lineId: string;
  variantId: string;
  productId: string;
  name: string;
  brand: string;
  image?: string;
  variantLabel: string;
  sku: string;
  unitPrice: number;
  stock: number;
  quantity: number;
};

type Store = {
  cart: CartLine[];
  cartOpen: boolean;
  setCartOpen: (v: boolean) => void;
  addToCart: (l: Omit<CartLine, 'lineId' | 'quantity'> & { quantity?: number }) => void;
  removeFromCart: (lineId: string) => void;
  setQuantity: (lineId: string, qty: number) => void;
  clearCart: () => void;
  cartCount: number;
  cartSubtotal: number;
  // Session / user (used by admin layout & account pages)
  user: User | null;
  setUser: (u: User | null) => void;
  refreshUser: () => Promise<User | null>;
  logout: () => Promise<void>;
};

const StoreCtx = createContext<Store | null>(null);
const STORAGE_KEY = 'drcloud_cart_v1';

export function StoreProvider({ children, initialCart }: { children: ReactNode; initialCart?: CartLine[] }) {
  const [cart, setCart] = useState<CartLine[]>(initialCart || []);
  const [cartOpen, setCartOpen] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [hydrated, setHydrated] = useState(false);

  const refreshUser = useCallback(async (): Promise<User | null> => {
    try {
      const r = await fetch('/api/auth/me', { cache: 'no-store' });
      if (!r.ok) { setUser(null); return null; }
      const d = await r.json();
      setUser(d.user || null);
      return d.user || null;
    } catch { setUser(null); return null; }
  }, []);

  const logout = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setUser(null);
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setCart(parsed);
      }
    } catch {}
    setHydrated(true);
    refreshUser();
  }, [refreshUser]);

  useEffect(() => {
    if (hydrated) localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
  }, [cart, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    const payload = cart.map((l) => ({ variantId: Number(l.variantId), quantity: l.quantity })).filter((l) => !isNaN(l.variantId));
    fetch('/api/cart', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ lines: payload }) }).catch(() => {});
  }, [cart, hydrated]);

  const addToCart: Store['addToCart'] = (line) => {
    setCart((prev) => {
      const idx = prev.findIndex((x) => x.variantId === line.variantId);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = { ...copy[idx], quantity: copy[idx].quantity + (line.quantity ?? 1) };
        return copy;
      }
      return [...prev, { ...line, lineId: crypto.randomUUID(), quantity: line.quantity ?? 1 } as CartLine];
    });
    setCartOpen(true);
  };

  const removeFromCart = (lineId: string) => setCart((p) => p.filter((l) => l.lineId !== lineId));
  const setQuantity = (lineId: string, qty: number) =>
    setCart((p) => p.map((l) => (l.lineId === lineId ? { ...l, quantity: Math.max(1, Math.min(l.stock, qty)) } : l)));
  const clearCart = () => setCart([]);

  const cartCount = useMemo(() => cart.reduce((s, l) => s + l.quantity, 0), [cart]);
  const cartSubtotal = useMemo(() => cart.reduce((s, l) => s + l.unitPrice * l.quantity, 0), [cart]);

  const value: Store = {
    cart, cartOpen, setCartOpen, addToCart, removeFromCart, setQuantity, clearCart,
    cartCount, cartSubtotal, user, setUser, refreshUser, logout,
  };
  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}

export function useStore() {
  const c = useContext(StoreCtx);
  if (!c) throw new Error('StoreProvider missing');
  return c;
}
