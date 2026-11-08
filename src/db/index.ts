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
      'DATABASE_URL is not set. Add your Neon (Postgres) connection string in the Vercel dashboard → Project → Settings → Environment Variables → DATABASE_URL, then redeploy. (Locally: create a .env file from .env.example.)',
    );
    throw _dbError;
  }
  try {
    const client = postgres(process.env.DATABASE_URL, {
      max: 10,
      // Neon requires SSL; idle timeout keeps serverless conn's healthy.
      ssl: 'require',
      idle_timeout: 20,
      connect_timeout: 10,
    });
    _db = drizzle(client, { schema });
    return _db;
  } catch (e: any) {
    _dbError = new Error(`Database connection failed: ${e?.message || e}. Check that DATABASE_URL points to a running Neon database and includes sslmode=require.`);
    throw _dbError;
  }
}

// Reset cached error between requests in dev (so fixing .env doesn't need a server restart).
if (process.env.NODE_ENV !== 'production') {
  setInterval(() => { _db = null; _dbError = null; }, 5000).unref?.();
}

// Proxy so `import { db } from '@/db'` is lazy — avoids crashing at build time when
// DATABASE_URL isn't set, and throws a helpful message at request time instead of
// a generic Next.js "Application error" digest page.
export const db = new Proxy({} as ReturnType<typeof drizzle>, {
  get(_t, prop) {
    const real = getDb();
    return (real as any)[prop];
  },
});
export type Db = typeof db;
