'use client';
import { useEffect } from 'react';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error('App error:', error); }, [error]);
  const isDbError = /DATABASE_URL|Database connection failed/i.test(error.message || '');
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center p-6">
      <div className="max-w-xl w-full rounded-2xl border border-red-500/30 bg-zinc-900 p-8 text-center">
        <div className="mx-auto h-14 w-14 rounded-full bg-red-500/20 text-red-300 grid place-items-center text-3xl">⚠</div>
        <h1 className="mt-4 text-2xl font-black text-white">Something went wrong</h1>
        {isDbError ? (
          <>
            <p className="mt-3 text-zinc-300 text-sm leading-relaxed">
              The site can't reach its database yet. This usually means <code className="text-teal-300">DATABASE_URL</code> isn't set in Vercel.
            </p>
            <div className="mt-4 rounded-lg bg-black/40 border border-white/10 p-4 text-left text-xs text-zinc-300 space-y-2">
              <p><b className="text-white">Fix it in Vercel:</b></p>
              <ol className="list-decimal list-inside space-y-1 text-zinc-400">
                <li>Open your Vercel project → <b>Settings</b> → <b>Environment Variables</b>.</li>
                <li>Add <code className="text-teal-300">DATABASE_URL</code> = your Neon <b>main</b>-branch connection string (starts with <code>postgresql://</code>).</li>
                <li>Also set <code className="text-teal-300">SESSION_PASSWORD</code> (any long random string) and <code className="text-teal-300">PAYMENT_GATEWAY=mock</code>.</li>
                <li>Go to <b>Deployments</b> → pick the latest → <b>Redeploy</b>.</li>
                <li>After redeploy, visit <code>/api/seed</code> once to populate products.</li>
              </ol>
            </div>
          </>
        ) : (
          <p className="mt-3 text-zinc-400 text-sm">{error.message || 'An unexpected error occurred.'}</p>
        )}
        <div className="mt-6 flex gap-2 justify-center">
          <button onClick={() => reset()} className="rounded-xl bg-teal-500 hover:bg-teal-400 text-black font-extrabold px-5 py-2.5 text-sm">Try again</button>
          <a href="/" className="rounded-xl border border-white/15 px-5 py-2.5 text-sm font-bold text-white hover:bg-white/5">Home</a>
        </div>
        {error.digest && <p className="mt-4 text-[11px] text-zinc-600">Digest: {error.digest}</p>}
      </div>
    </div>
  );
}
