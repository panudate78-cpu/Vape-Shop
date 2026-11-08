import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

let _db: ReturnType<typeof drizzle> | null = null;

function getDb() {
  if (_db) return _db;
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set — copy .env.example to .env and fill in your Postgres (Neon) connection string.');
  }
  const client = postgres(process.env.DATABASE_URL, { max: 10 });
  _db = drizzle(client, { schema });
  return _db;
}

// Proxy so `import { db } from '@/db'` gives a lazy object — avoids crashing at build time
// when DATABASE_URL isn't set yet. All property access goes through the real client once accessed.
export const db = new Proxy({} as ReturnType<typeof drizzle>, {
  get(_t, prop) {
    const real = getDb();
    return (real as any)[prop];
  },
});
export type Db = typeof db;
