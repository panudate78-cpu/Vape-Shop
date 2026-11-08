"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { isAdult } from "@/lib/format";

export default function RegisterPage() {
  const [form, setForm] = useState({ email: "", password: "", fullName: "", dob: "" });
  const [agree, setAgree] = useState(false);
  const [err, setErr] = useState("");
  const router = useRouter();
  const { refreshUser } = useStore();
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    if (!isAdult(form.dob)) { setErr("You must be 18+ to register."); return; }
    if (!agree) { setErr("Please accept the age & nicotine declaration."); return; }
    const r = await fetch("/api/auth/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    const j = await r.json();
    if (!r.ok) { setErr(j.error); return; }
    await refreshUser();
    router.push("/account");
  };
  return (
    <div className="mx-auto max-w-md px-4 py-14">
      <div className="rounded-2xl border border-white/10 bg-zinc-900 p-8">
        <h1 className="text-2xl font-black text-white">Create account</h1>
        <p className="mt-1 text-sm text-zinc-400">18+ only · nicotine compliance applies</p>
        <form onSubmit={submit} className="mt-5 space-y-3">
          <input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} placeholder="Full name" className="w-full rounded-xl border border-white/10 bg-zinc-950 px-4 py-3 text-sm outline-none" />
          <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Email" type="email" required className="w-full rounded-xl border border-white/10 bg-zinc-950 px-4 py-3 text-sm outline-none" />
          <input value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Password (8+ chars)" type="password" required className="w-full rounded-xl border border-white/10 bg-zinc-950 px-4 py-3 text-sm outline-none" />
          <div><label className="text-xs font-bold text-zinc-300">DATE OF BIRTH *</label><input type="date" value={form.dob} onChange={(e) => setForm({ ...form, dob: e.target.value })} required max={new Date().toISOString().slice(0, 10)} className="mt-1 w-full rounded-xl border border-white/10 bg-zinc-950 px-4 py-3 text-sm outline-none" /></div>
          <label className="flex items-start gap-2 text-xs text-zinc-400"><input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-1 accent-teal-400" />I confirm I am 18+ and understand vaping products contain nicotine which is addictive.</label>
          {err && <p className="text-sm font-bold text-red-400">{err}</p>}
          <button className="w-full rounded-xl bg-teal-500 py-3 text-sm font-extrabold text-black hover:bg-teal-400">Register</button>
        </form>
        <p className="mt-4 text-center text-xs text-zinc-400">Have an account? <Link href="/login" className="text-teal-300 underline">Login</Link></p>
      </div>
    </div>
  );
}
