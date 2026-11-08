"use client";
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

export type CartLine = {
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

type StoreCtx = {
  cart: CartLine[];
  addToCart: (l: Omit<CartLine, "quantity">, qty?: number) => void;
  updateQty: (variantId: string, qty: number) => void;
  removeLine: (variantId: string) => void;
  clearCart: () => void;
  cartOpen: boolean;
  setCartOpen: (v: boolean) => void;
  subtotal: number;
  count: number;
  user: { id: string; email: string; role: string; fullName?: string | null } | null;
  refreshUser: () => Promise<void>;
  ageVerified: boolean;
  setAgeVerified: (v: boolean) => void;
};

const Ctx = createContext<StoreCtx | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [cart, setCart] = useState<CartLine[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [user, setUser] = useState<StoreCtx["user"]>(null);
  const [ageVerified, setAgeVerifiedState] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("vs_cart");
      if (raw) setCart(JSON.parse(raw));
      const av = localStorage.getItem("vs_age_verified");
      if (av === "1") setAgeVerifiedState(true);
    } catch {}
    refreshUser();
  }, []);

  useEffect(() => {
    try { localStorage.setItem("vs_cart", JSON.stringify(cart)); } catch {}
  }, [cart]);

  const setAgeVerified = (v: boolean) => {
    setAgeVerifiedState(v);
    try {
      if (v) {
        localStorage.setItem("vs_age_verified", "1");
        document.cookie = "vs_age_verified=1; path=/; max-age=31536000; SameSite=Lax";
      } else {
        localStorage.removeItem("vs_age_verified");
      }
    } catch {}
  };

  const refreshUser = async () => {
    try {
      const r = await fetch("/api/auth/me", { cache: "no-store" });
      const j = await r.json();
      setUser(j.user || null);
    } catch { setUser(null); }
  };

  const addToCart: StoreCtx["addToCart"] = (l, qty = 1) => {
    setCart((prev) => {
      const f = prev.find((x) => x.variantId === l.variantId);
      if (f) {
        return prev.map((x) =>
          x.variantId === l.variantId ? { ...x, quantity: Math.min(x.stock || 99, x.quantity + qty) } : x
        );
      }
      return [...prev, { ...l, quantity: Math.min(qty, l.stock || 99) }];
    });
    setCartOpen(true);
  };
  const updateQty = (variantId: string, qty: number) => {
    setCart((prev) =>
      qty <= 0 ? prev.filter((x) => x.variantId !== variantId) : prev.map((x) => (x.variantId === variantId ? { ...x, quantity: Math.min(qty, x.stock || 99) } : x))
    );
  };
  const removeLine = (variantId: string) => setCart((prev) => prev.filter((x) => x.variantId !== variantId));
  const clearCart = () => setCart([]);

  const subtotal = useMemo(() => cart.reduce((s, l) => s + l.unitPrice * l.quantity, 0), [cart]);
  const count = useMemo(() => cart.reduce((s, l) => s + l.quantity, 0), [cart]);

  return (
    <Ctx.Provider value={{ cart, addToCart, updateQty, removeLine, clearCart, cartOpen, setCartOpen, subtotal, count, user, refreshUser, ageVerified, setAgeVerified }}>
      {children}
    </Ctx.Provider>
  );
}

export function useStore() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useStore outside provider");
  return c;
}
