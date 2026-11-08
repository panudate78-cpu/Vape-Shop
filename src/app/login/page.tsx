"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useStore } from "@/lib/store";

export default function LoginPage() {
  const [email, setEmail] = useState("demo@customer.co.uk");
  const [password, setPassword] = useState("Customer123!");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { refreshUser } = useStore();
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(""); setLoading(true);
    const r = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
    const j = await r.json();
    setLoading(false);
    if (!r.ok) { setErr(j.error); return; }
    await refreshUser();
    router.push(j.user.role === "ADMIN" ? "/admin" : "/account");
  };
  return (
    <div className="mx-auto max-w-md px-4 py-14">
      <div className="rounded-2xl border border-white/10 bg-zinc-900 p-8">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/dr-cloud-logo.png" alt="Dr Cloud Chessington" className="h-11 w-11 rounded-xl object-cover" />
          <div><h1 className="text-2xl font-black text-white">Welcome back</h1><p className="text-[11px] font-bold uppercase tracking-widest text-teal-300">Dr Cloud Chessington</p></div>
        </div>
        <p className="mt-2 text-sm text-zinc-400">Demo customer prefilled · Admin: admin@vapeshop.co.uk / Admin123!</p>
        <form onSubmit={submit} className="mt-5 space-y-3">
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" type="email" className="w-full rounded-xl border border-white/10 bg-zinc-950 px-4 py-3 text-sm outline-none focus:border-teal-400" />
          <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" type="password" className="w-full rounded-xl border border-white/10 bg-zinc-950 px-4 py-3 text-sm outline-none focus:border-teal-400" />
          {err && <p className="text-sm font-bold text-red-400">{err}</p>}
          <button disabled={loading} className="w-full rounded-xl bg-teal-500 py-3 text-sm font-extrabold text-black hover:bg-teal-400">{loading ? "…" : "Login"}</button>
        </form>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button onClick={() => { setEmail("demo@customer.co.uk"); setPassword("Customer123!"); }} className="rounded-lg border border-white/10 py-2 text-xs font-bold text-zinc-300">Customer demo</button>
          <button onClick={() => { setEmail("admin@vapeshop.co.uk"); setPassword("Admin123!"); }} className="rounded-lg border border-amber-400/40 py-2 text-xs font-bold text-amber-300">Admin demo</button>
        </div>
        <p className="mt-4 text-center text-xs text-zinc-400">No account? <Link href="/register" className="text-teal-300 underline">Register</Link></p>
      </div>
    </div>
  );
}
