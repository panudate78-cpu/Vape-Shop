import { db } from '@/db';
import { sql } from 'drizzle-orm';

// Lazy, idempotent migrations for the POS upgrade. Every statement is
// ADD COLUMN IF NOT EXISTS / CREATE TABLE IF NOT EXISTS, so running them on
// each cold start is safe and existing data is untouched.
let done = false;
let inflight: Promise<void> | null = null;

export function ensurePosSchema(): Promise<void> {
  if (done) return Promise.resolve();
  if (!inflight) {
    inflight = (async () => {
      const stmts = [
        sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS source TEXT`,
        sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method TEXT`,
        sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS staff_note TEXT`,
        sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS parent_order_id INTEGER`,
        sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS refund_reason TEXT`,
        sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_breakdown JSONB`,
        sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS cash_tendered NUMERIC(10,2)`,
        sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS change_given NUMERIC(10,2)`,
        sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS receipt_emailed_to TEXT`,
        sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS cost_price NUMERIC(10,2)`,
        sql`ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS barcode TEXT`,
        sql`CREATE TABLE IF NOT EXISTS held_baskets (
              id SERIAL PRIMARY KEY,
              hold_code TEXT NOT NULL UNIQUE,
              customer_label TEXT,
              items JSONB NOT NULL,
              discount NUMERIC(10,2) DEFAULT 0,
              discount_pct NUMERIC(5,2) DEFAULT 0,
              note TEXT,
              held_by TEXT,
              created_at TIMESTAMP NOT NULL DEFAULT NOW(),
              resumed_at TIMESTAMP
            )`,
      ];
      for (const s of stmts) {
        try { await db.execute(s); } catch (e) {
          const msg = (e as Error)?.message || '';
          if (!/already exists|duplicate column/i.test(msg)) console.warn('[pos-schema]', msg);
        }
      }
      try { await db.execute(sql`UPDATE orders SET source='online' WHERE source IS NULL OR source=''`); } catch {}
      done = true;
    })().finally(() => { inflight = null; });
  }
  return inflight;
}
