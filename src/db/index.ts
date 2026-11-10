import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import { LAZY_SQL } from './lazy-sql';

let _db: ReturnType<typeof drizzle> | null = null;
let _dbError: Error | null = null;

// One-time, idempotent schema upgrade. Every query waits for it (see gate()),
// so code can select newly added columns on an un-migrated database.
let _migrated: Promise<void> | null = null;
async function runLazyMigrations(client: ReturnType<typeof postgres>) {
  try {
    await client.unsafe(LAZY_SQL.join(';\n'));
  } catch {
    // Fall back to statement-by-statement so one bad statement can't block the rest.
    for (const stmt of LAZY_SQL) {
      try { await client.unsafe(stmt); } catch (e: any) {
        if (!/already exists|duplicate column/i.test(e?.message || '')) console.warn('[db] migration:', e?.message);
      }
    }
  }
}
function currentReady(): Promise<void> { return _migrated ?? Promise.resolve(); }

// Wrap a drizzle builder / promise so that awaiting it waits for migrations.
function gate(x: any): any {
  if (x === null || (typeof x !== 'object' && typeof x !== 'function')) return x;
  return new Proxy(x, {
    get(t, p) {
      if (p === 'then') return (res: any, rej: any) => currentReady().then(() => t.then(res, rej));
      const v = Reflect.get(t, p, t);
      if (typeof v === 'function') return (...a: any[]) => gate(v.apply(t, a));
      if (v !== null && typeof v === 'object') return gate(v);
      return v;
    },
  });
}

function getDb() {
  if (_db) return _db;
  if (_dbError) throw _dbError;
  if (!process.env.DATABASE_URL) {
    _dbError = new Error(
      'DATABASE_URL is not set. Add your Neon (Postgres) connection string in Vercel → Settings → Environment Variables → DATABASE_URL, then redeploy. (Locally: create a .env file from .env.example.)',
    );
    throw _dbError;
  }
  try {
    // Neon-friendly config: pooled connections need prepare=false and
    // short max_lifetime so serverless functions don't hit stale pooled sockets
    // (which manifest as ECONNRESET on hot queries).
    const url = process.env.DATABASE_URL;
    const isPooled = /-pooler\./.test(url);
    const client = postgres(url, {
      max: isPooled ? 1 : 10,
      ssl: 'require',
      connect_timeout: 15,
      idle_timeout: isPooled ? 0 : 20,
      max_lifetime: isPooled ? 60 * 5 : 60 * 30,
      prepare: isPooled ? false : true, // Neon pooler doesn't support named prepared statements
      onnotice: () => {}, // silence 'already exists, skipping' notices from idempotent migrations
    });
    _db = drizzle(client, { schema });
    if (!_migrated) _migrated = runLazyMigrations(client);
    return _db;
  } catch (e: any) {
    _dbError = new Error(`Database connection failed: ${e?.message || e}. Check that DATABASE_URL points to a running Neon database and includes sslmode=require.`);
    throw _dbError;
  }
}

// Reset cached error between requests in dev (so fixing .env doesn't need a restart).
if (process.env.NODE_ENV !== 'production') {
  setInterval(() => { _db = null; _dbError = null; }, 5000).unref?.();
}

// Lazy proxy — avoids crashing at build time when DATABASE_URL isn't set.
export const db = new Proxy({} as ReturnType<typeof drizzle>, {
  get(_t, prop) {
    const real = getDb();
    const v = (real as any)[prop];
    if (typeof v === 'function') return (...a: any[]) => gate(v.apply(real, a));
    return v;
  },
});

/** Resolves once lazy schema migrations have completed (safe to call repeatedly). */
export async function dbReady(): Promise<void> {
  getDb();
  await currentReady();
}
export type Db = typeof db;
