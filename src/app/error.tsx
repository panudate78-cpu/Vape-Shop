'use client';
import { useEffect } from 'react';

/** Safely stringify anything that might be thrown so we never pass an object
 *  into JSX (which causes React minified error #438). */
function safeMessage(err: unknown): string {
  if (!err) return '';
  if (typeof err === 'string') return err;
  const anyErr = err as any;
  if (anyErr && typeof anyErr === 'object') {
    if (typeof anyErr.message === 'string') return anyErr.message;
    try { return JSON.stringify(anyErr); } catch { return 'Unknown error'; }
  }
  try { return String(err); } catch { return 'Unknown error'; }
}

export default function Error({ error, reset }: { error: Error & { digest?: string; cause?: unknown }; reset: () => void }) {
  useEffect(() => { console.error('App error:', error); }, [error]);
  const msg = safeMessage(error);
  const isDbError = /DATABASE_URL|database connection failed|ECONNRESET|connection failed/i.test(msg);
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center p-6">
      <div className="max-w-xl w-full rounded-2xl border border-red-500/30 bg-zinc-900 p-8 text-center">
        <div className="mx-auto h-14 w-14 rounded-full bg-red-500/20 text-red-300 grid place-items-center text-3xl">⚠</div>
        <h1 className="mt-4 text-2xl font-black text-white">Something went wrong</h1>
        {isDbError ? (
          <>
            <p className="mt-3 text-zinc-300 text-sm leading-relaxed">
              The site can't reach its database right now. If this keeps happening, the Neon database may be idle or the connection string may have changed.
            </p>
            <div className="mt-4 rounded-lg bg-black/40 border border-white/10 p-4 text-left text-xs text-zinc-300 space-y-2">
              <p><b className="text-white">Check:</b></p>
              <ol className="list-decimal list-inside space-y-1 text-zinc-400">
                <li>Open the Neon console and confirm the database isn't paused.</li>
                <li>Double-check <code className="text-teal-300">DATABASE_URL</code> in Vercel → Settings → Environment Variables.</li>
                <li>Redeploy the site and try again.</li>
              </ol>
            </div>
          </>
        ) : (
          <p className="mt-3 text-zinc-400 text-sm">Sorry, an unexpected error occurred. Please try again.</p>
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
