'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function RegisterPage() {
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [fullName, setFullName] = useState('');
  const [dob, setDob] = useState(''); const [err, setErr] = useState<string | null>(null); const [loading, setLoading] = useState(false);
  const router = useRouter();
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true); setErr(null);
    const r = await fetch('/api/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password, fullName, dob }) });
    const d = await r.json(); setLoading(false);
    if (!r.ok) { setErr(d.error || 'Registration failed'); return; }
    router.push('/account'); router.refresh();
  };
  return (
    <div className="max-w-md mx-auto card mt-8">
      <h1 className="text-xl font-bold">Create an account</h1>
      <p className="text-sm text-slate-500 mt-1">You must be 18 or over to register.</p>
      <form onSubmit={submit} className="space-y-3 mt-4">
        <div><label htmlFor="reg-name" className="label">Full name</label><input id="reg-name" autoComplete="name" className="input" required value={fullName} onChange={(e) => setFullName(e.target.value)} /></div>
        <div><label htmlFor="reg-email" className="label">Email</label><input id="reg-email" autoComplete="email" className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <div><label htmlFor="reg-password" className="label">Password (at least 6 characters)</label><input id="reg-password" autoComplete="new-password" className="input" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} /></div>
        <div><label htmlFor="reg-dob" className="label">Date of birth</label><input id="reg-dob" autoComplete="bday" className="input" type="date" required value={dob} onChange={(e) => setDob(e.target.value)} /></div>
        {err && <div role="alert" className="text-sm font-semibold text-red-900">{err}</div>}
        <button className="btn-primary w-full" disabled={loading}>{loading ? 'Creating…' : 'Create account'}</button>
        <p className="text-xs text-slate-400 text-center">By registering you confirm you are aged 18 or over and accept our terms.</p>
        <p className="text-sm text-center text-slate-500">Already got an account? <Link href="/login" className="text-slate-900 underline">Sign in</Link></p>
      </form>
    </div>
  );
}
