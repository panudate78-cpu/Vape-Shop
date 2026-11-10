// Idempotent schema migrations applied once per server process, before the
// first query (see db/index.ts). Every statement is IF NOT EXISTS, so running
// them against an up-to-date database is a no-op. No foreign keys are declared
// on purpose: it keeps the statements order-independent and cheap to re-run.
export const LAZY_SQL: string[] = [
  // ---- orders: POS + returns ----
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS source TEXT`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method TEXT`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS staff_note TEXT`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS parent_order_id INTEGER`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS refund_reason TEXT`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_breakdown JSONB`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS cash_tendered NUMERIC(10,2)`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS change_given NUMERIC(10,2)`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS receipt_emailed_to TEXT`,
  `UPDATE orders SET source='online' WHERE source IS NULL OR source=''`,
  // ---- products / variants ----
  `ALTER TABLE products ADD COLUMN IF NOT EXISTS cost_price NUMERIC(10,2)`,
  `ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS barcode TEXT`,
  `ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS reserved_quantity INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS unit_cost NUMERIC(10,2)`,
  `ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS supplier_id INTEGER`,
  // ---- POS held baskets ----
  `CREATE TABLE IF NOT EXISTS held_baskets (
     id SERIAL PRIMARY KEY, hold_code TEXT NOT NULL UNIQUE, customer_label TEXT,
     items JSONB NOT NULL, discount NUMERIC(10,2) DEFAULT 0, discount_pct NUMERIC(5,2) DEFAULT 0,
     note TEXT, held_by TEXT, created_at TIMESTAMP NOT NULL DEFAULT NOW(), resumed_at TIMESTAMP)`,
  // ---- stock control ----
  // Upsert target for stocktake lines. Also created for tables that predate this constraint.
  `CREATE UNIQUE INDEX IF NOT EXISTS stocktake_counts_stocktake_variant_uq ON stocktake_counts (stocktake_id, variant_id)`,
  `CREATE TABLE IF NOT EXISTS stock_movements (
     id SERIAL PRIMARY KEY, variant_id INTEGER NOT NULL, delta INTEGER NOT NULL,
     qty_before INTEGER NOT NULL, qty_after INTEGER NOT NULL, reason TEXT NOT NULL,
     actor TEXT NOT NULL, note TEXT, order_id INTEGER, po_id INTEGER, stocktake_id INTEGER,
     batch_id INTEGER, ref_key TEXT, created_at TIMESTAMP NOT NULL DEFAULT NOW())`,
  `CREATE INDEX IF NOT EXISTS stock_movements_variant_idx ON stock_movements (variant_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS stock_movements_ref_idx ON stock_movements (ref_key)`,
  `CREATE TABLE IF NOT EXISTS stock_reservations (
     id SERIAL PRIMARY KEY, order_id INTEGER NOT NULL, variant_id INTEGER NOT NULL,
     quantity INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'active',
     expires_at TIMESTAMP NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT NOW())`,
  `CREATE INDEX IF NOT EXISTS stock_reservations_status_idx ON stock_reservations (status, expires_at)`,
  `CREATE TABLE IF NOT EXISTS stock_batches (
     id SERIAL PRIMARY KEY, variant_id INTEGER NOT NULL, batch_code TEXT NOT NULL,
     expiry_date DATE, qty_received INTEGER NOT NULL, qty_remaining INTEGER NOT NULL,
     unit_cost NUMERIC(10,2), po_id INTEGER, received_at TIMESTAMP NOT NULL DEFAULT NOW(),
     recalled BOOLEAN NOT NULL DEFAULT false)`,
  `CREATE INDEX IF NOT EXISTS stock_batches_variant_idx ON stock_batches (variant_id, expiry_date)`,
  `CREATE TABLE IF NOT EXISTS suppliers (
     id SERIAL PRIMARY KEY, name TEXT NOT NULL, contact_name TEXT, email TEXT, phone TEXT,
     account_ref TEXT, lead_time_days INTEGER NOT NULL DEFAULT 7, notes TEXT,
     active BOOLEAN NOT NULL DEFAULT true, created_at TIMESTAMP NOT NULL DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS purchase_orders (
     id SERIAL PRIMARY KEY, po_number TEXT NOT NULL UNIQUE, supplier_id INTEGER NOT NULL,
     status TEXT NOT NULL DEFAULT 'draft', expected_at TIMESTAMP, notes TEXT, created_by TEXT,
     created_at TIMESTAMP NOT NULL DEFAULT NOW(), sent_at TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS purchase_order_lines (
     id SERIAL PRIMARY KEY, po_id INTEGER NOT NULL, variant_id INTEGER NOT NULL,
     quantity_ordered INTEGER NOT NULL, quantity_received INTEGER NOT NULL DEFAULT 0,
     unit_cost NUMERIC(10,2) NOT NULL DEFAULT 0)`,
  `CREATE INDEX IF NOT EXISTS po_lines_po_idx ON purchase_order_lines (po_id)`,
  `CREATE TABLE IF NOT EXISTS stocktakes (
     id SERIAL PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'partial',
     status TEXT NOT NULL DEFAULT 'open', started_by TEXT, started_at TIMESTAMP NOT NULL DEFAULT NOW(),
     completed_by TEXT, completed_at TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS stocktake_counts (
     id SERIAL PRIMARY KEY, stocktake_id INTEGER NOT NULL, variant_id INTEGER NOT NULL,
     expected_qty INTEGER NOT NULL DEFAULT 0, counted_qty INTEGER, updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
     UNIQUE (stocktake_id, variant_id))`,
];
