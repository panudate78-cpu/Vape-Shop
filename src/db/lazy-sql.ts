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
  // ---- orders: separate fulfilment from payment, refunds, history, notifications ----
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS fulfilment_status TEXT NOT NULL DEFAULT 'unfulfilled'`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS refunded_amount NUMERIC(10,2) NOT NULL DEFAULT 0`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS ready_at TIMESTAMP`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipped_at TIMESTAMP`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMP`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS collected_at TIMESTAMP`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS collected_by TEXT`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS id_checked BOOLEAN`,
  // One-off style backfill from the old combined status column. Only touches rows still at the default.
  `UPDATE orders SET fulfilment_status = status WHERE fulfilment_status = 'unfulfilled' AND status IN ('processing','ready','shipped','collected','cancelled')`,
  `UPDATE orders SET fulfilment_status = 'collected' WHERE fulfilment_status = 'unfulfilled' AND source = 'pos'`,
  `CREATE TABLE IF NOT EXISTS order_events (
     id SERIAL PRIMARY KEY, order_id INTEGER NOT NULL, at TIMESTAMP NOT NULL DEFAULT NOW(),
     kind TEXT NOT NULL, actor TEXT, detail JSONB)`,
  `CREATE INDEX IF NOT EXISTS order_events_order_idx ON order_events (order_id, at)`,
  `CREATE TABLE IF NOT EXISTS order_refunds (
     id SERIAL PRIMARY KEY, order_id INTEGER NOT NULL, refund_key TEXT NOT NULL UNIQUE,
     amount NUMERIC(10,2) NOT NULL, reason_code TEXT NOT NULL, reason_note TEXT,
     resolution TEXT NOT NULL DEFAULT 'refund', replacement_order_id INTEGER,
     method TEXT NOT NULL, created_by TEXT, created_at TIMESTAMP NOT NULL DEFAULT NOW())`,
  `CREATE INDEX IF NOT EXISTS order_refunds_order_idx ON order_refunds (order_id)`,
  `ALTER TABLE order_refunds ADD COLUMN IF NOT EXISTS include_shipping BOOLEAN NOT NULL DEFAULT FALSE`,
  `CREATE TABLE IF NOT EXISTS order_refund_lines (
     id SERIAL PRIMARY KEY, refund_id INTEGER NOT NULL, order_item_id INTEGER NOT NULL,
     variant_id INTEGER, quantity INTEGER NOT NULL, amount NUMERIC(10,2) NOT NULL,
     restock BOOLEAN NOT NULL DEFAULT TRUE)`,
  `CREATE INDEX IF NOT EXISTS order_refund_lines_refund_idx ON order_refund_lines (refund_id)`,
  `CREATE TABLE IF NOT EXISTS notifications (
     id SERIAL PRIMARY KEY, order_id INTEGER NOT NULL, kind TEXT NOT NULL, recipient TEXT NOT NULL,
     dedupe_key TEXT NOT NULL UNIQUE, subject TEXT, status TEXT NOT NULL DEFAULT 'pending',
     attempts INTEGER NOT NULL DEFAULT 0, last_error TEXT,
     created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW(), sent_at TIMESTAMP)`,
  `CREATE INDEX IF NOT EXISTS notifications_order_idx ON notifications (order_id)`,
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
  // ---- staff accounts, cash and audit ----
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS pin_lookup TEXT`,
  `CREATE UNIQUE INDEX IF NOT EXISTS users_pin_lookup_uq ON users (pin_lookup) WHERE pin_lookup IS NOT NULL`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS staff_user_id INTEGER`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS staff_name TEXT`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS register_id TEXT`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS shift_id INTEGER`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS approved_by TEXT`,
  `CREATE TABLE IF NOT EXISTS cash_shifts (
     id SERIAL PRIMARY KEY, register TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open',
     opened_by_user_id INTEGER, opened_by_name TEXT, opened_at TIMESTAMP NOT NULL DEFAULT NOW(),
     opening_float NUMERIC(10,2) NOT NULL DEFAULT 0, closed_by_user_id INTEGER, closed_by_name TEXT,
     closed_at TIMESTAMP, expected_cash NUMERIC(10,2), counted_cash NUMERIC(10,2),
     variance NUMERIC(10,2), discrepancy_note TEXT)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS cash_shifts_one_open ON cash_shifts (register) WHERE status = 'open'`,
  `CREATE TABLE IF NOT EXISTS cash_movements (
     id SERIAL PRIMARY KEY, shift_id INTEGER NOT NULL, kind TEXT NOT NULL, amount NUMERIC(10,2) NOT NULL,
     reason TEXT NOT NULL, staff_user_id INTEGER, staff_name TEXT, created_at TIMESTAMP NOT NULL DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS audit_log (
     id SERIAL PRIMARY KEY, at TIMESTAMP NOT NULL DEFAULT NOW(), actor_user_id INTEGER, actor_name TEXT,
     actor_role TEXT, register_id TEXT, action TEXT NOT NULL, entity TEXT, entity_id TEXT, detail JSONB)`,
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
