import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

let _db: ReturnType<typeof drizzle> | null = null;
let _dbError: Error | null = null;

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
    });
    _db = drizzle(client, { schema });
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
    return (real as any)[prop];
  },
});
export type Db = typeof db;
