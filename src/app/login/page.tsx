'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function LoginPage() {
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null); const [loading, setLoading] = useState(false);
  const router = useRouter();
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true); setErr(null);
    const r = await fetch('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) });
    const d = await r.json();
    setLoading(false);
    if (!r.ok) { setErr(d.error || 'Login failed'); return; }
    // Admins go straight to the dashboard; customers go to their account.
    const dest = d.user?.role === 'ADMIN' ? '/admin' : '/account';
    router.push(dest); router.refresh();
  };
  return (
    <div className="max-w-md mx-auto card mt-8">
      <h1 className="text-xl font-bold">Login</h1>
      <p className="text-sm text-zinc-400 mt-1">Sign in to your account to track orders and checkout faster.</p>
      <form onSubmit={submit} className="space-y-3 mt-4">
        <div><label className="label">Email</label><input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <div><label className="label">Password</label><input className="input" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} /></div>
        {err && <div className="text-red-400 text-sm">{err}</div>}
        <button className="btn-primary w-full" disabled={loading}>{loading ? 'Signing in…' : 'Sign in'}</button>
        <p className="text-sm text-center text-zinc-400">No account? <Link href="/register" className="text-teal-300 underline">Register</Link></p>
      </form>
    </div>
  );
}
