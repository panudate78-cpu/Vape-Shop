"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useStore } from "@/lib/store";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const { user, refreshUser } = useStore();
  const [checked, setChecked] = useState(false);
  useEffect(() => {
    refreshUser().then(() => setChecked(true));
  }, []);
  useEffect(() => {
    if (checked && (!user || user.role !== "ADMIN")) router.push("/login");
  }, [checked, user]);
  if (!checked || !user) return <div className="p-10 text-center text-zinc-400">Checking admin access…</div>;
  if (user.role !== "ADMIN") return <div className="p-10 text-center text-red-400">Forbidden — admins only.</div>;
  const links = [
    { href: "/admin", label: "📊 Overview" },
    { href: "/admin/pos", label: "🛒 Till (POS)" },
    { href: "/admin/orders", label: "📦 Orders" },
    { href: "/admin/stock", label: "📦 Stock control" },
    { href: "/admin/inventory", label: "📉 Inventory" },
    { href: "/admin/products", label: "🧴 Products" },
    { href: "/admin/categories", label: "🏷 Categories" },
    { href: "/admin/import", label: "📥 CSV Import/Export" },
    { href: "/shop", label: "🛍 View Store" },
  ];
  return (
    <div className="admin-dark min-h-screen">
    <div className="mx-auto max-w-7xl px-4 py-6">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-black text-white">Admin Dashboard</h1>
        <span className="rounded-full bg-amber-400 px-2.5 py-0.5 text-[11px] font-black text-black">{user.email}</span>
      </div>
      <nav className="mt-4 flex gap-2 overflow-x-auto">
        {links.map((l) => (
          <Link key={l.href} href={l.href} className={`shrink-0 rounded-xl px-4 py-2 text-sm font-bold ${path === l.href ? "bg-amber-400 text-black" : "bg-white/5 text-zinc-300 hover:bg-white/10"}`}>{l.label}</Link>
        ))}
      </nav>
      <div className="mt-6">{children}</div>
    </div>
    </div>
  );
}
