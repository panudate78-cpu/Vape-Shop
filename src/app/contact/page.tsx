'use client';
import { useState } from 'react';
import Link from 'next/link';
import { BRAND, fullAddress, googleMapsUrl } from '@/lib/brand';

export default function ContactPage() {
  const [form, setForm] = useState({ name: '', email: '', phone: '', subject: 'General enquiry', message: '' });
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | { error: string }>('idle');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setState('sending');
    try {
      const r = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(form),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setState({ error: j.error || `Something went wrong (${r.status})` }); return; }
      setState('sent');
    } catch (err: any) {
      setState({ error: err?.message || 'Network error — please try again.' });
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-3xl font-black text-slate-900">Contact Dr Cloud</h1>
      <p className="mt-2 text-slate-600">Questions about stock, an order, or a phone repair? Drop us a message, call in, or pop by the shop.</p>

      <div className="mt-8 grid gap-8 md:grid-cols-2">
        {/* Info column */}
        <div className="space-y-4">
          <div className="card">
            <h2 className="font-extrabold text-slate-900">📍 Visit the shop</h2>
            <p className="mt-2 text-slate-700">{fullAddress}</p>
            <a href={googleMapsUrl} target="_blank" rel="noreferrer" className="mt-3 inline-block text-[#64B5F6] font-bold hover:text-[#4FA3E8] underline">Get directions on Google Maps →</a>
          </div>
          <div className="card">
            <h2 className="font-extrabold text-slate-900">📞 Call us</h2>
            <p className="mt-2 text-slate-700"><a href={BRAND.phoneHref} className="text-[#64B5F6] font-bold hover:text-[#4FA3E8] underline">{BRAND.phone}</a></p>
            <p className="mt-1 text-sm text-slate-500">Best during opening hours — see <Link href="/visit" className="text-[#64B5F6] hover:text-[#4FA3E8] underline">Store info</Link>.</p>
          </div>
          <div className="card">
            <h2 className="font-extrabold text-slate-900">✉️ Email</h2>
            <p className="mt-2 text-slate-700">
              General enquiries: <a href={`mailto:${BRAND.email}`} className="text-[#64B5F6] font-bold hover:text-[#4FA3E8] underline">{BRAND.email}</a>
            </p>
            <p className="mt-1 text-sm text-slate-500">We'll reply within one working day. For same-day stock checks, please call.</p>
          </div>
          <div className="card">
            <h2 className="font-extrabold text-slate-900">🕒 Opening hours</h2>
            <ul className="mt-2 space-y-1 text-slate-700 text-sm">
              {BRAND.hours.map((h) => (
                <li key={h.day} className="flex justify-between"><span className="font-semibold">{h.day}</span><span>{h.time}</span></li>
              ))}
            </ul>
          </div>
        </div>

        {/* Form column */}
        <div className="card">
          <h2 className="font-extrabold text-slate-900">Send us a message</h2>
          {state === 'sent' ? (
            <div className="mt-4 rounded-lg border border-[#64B5F6]/40 bg-[#64B5F6]/10 p-4 text-sm text-slate-800">
              ✅ Thanks {form.name || 'for your message'} — we'll get back to you as soon as we can (usually within one working day). If it's urgent please call <a href={BRAND.phoneHref} className="underline text-[#64B5F6] font-bold hover:text-[#4FA3E8]">{BRAND.phone}</a>.
            </div>
          ) : (
            <form onSubmit={submit} className="mt-4 space-y-3">
              <div>
                <label htmlFor="contact-name" className="label">Your name *</label>
                <input id="contact-name" autoComplete="name" className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="contact-email" className="label">Email *</label>
                  <input id="contact-email" type="email" autoComplete="email" className="input" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                </div>
                <div>
                  <label htmlFor="contact-phone" className="label">Phone (optional)</label>
                  <input id="contact-phone" type="tel" autoComplete="tel" className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                </div>
              </div>
              <div>
                <label htmlFor="contact-subject" className="label">Subject</label>
                <select id="contact-subject" className="input" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })}>
                  <option>General enquiry</option>
                  <option>Stock check / product question</option>
                  <option>Online order help</option>
                  <option>Click & Collect query</option>
                  <option>Phone repair quote</option>
                  <option>Wholesale / trade</option>
                  <option>Feedback</option>
                </select>
              </div>
              <div>
                <label htmlFor="contact-message" className="label">Message *</label>
                <textarea id="contact-message" rows={5} required className="input" value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} />
              </div>
              {typeof state === 'object' && state.error && (
                <div role="alert" className="rounded-lg border border-red-400 bg-red-50 p-3 text-sm font-semibold text-red-900">❌ {state.error}</div>
              )}
              <button type="submit" disabled={state === 'sending'} className="btn-primary w-full py-3">
                {state === 'sending' ? 'Sending…' : 'Send message'}
              </button>
              <p className="text-[11px] text-slate-500">
                Your message will be emailed to <b>{BRAND.email}</b>. We won't share your details with anyone.
              </p>
            </form>
          )}
        </div>
      </div>

      <div className="mt-10">
        <Link href="/" className="text-[#64B5F6] hover:text-[#4FA3E8] font-bold">← Back to Dr Cloud</Link>
      </div>
    </div>
  );
}
