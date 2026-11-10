import { pgTable, serial, text, integer, numeric, boolean, timestamp, jsonb, doublePrecision, uniqueIndex } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: text('role').notNull().default('CUSTOMER'), // CUSTOMER | ADMIN
  dob: text('dob'),
  fullName: text('full_name'),
  phone: text('phone'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const categories = pgTable('categories', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  description: text('description').default(''),
});

export const products = pgTable('products', {
  id: serial('id').primaryKey(),
  categoryId: integer('category_id').references(() => categories.id),
  name: text('name').notNull(),
  brand: text('brand').notNull().default(''),
  description: text('description').default(''),
  basePrice: numeric('base_price', { precision: 10, scale: 2 }).notNull().default('0'),
  costPrice: numeric('cost_price', { precision: 10, scale: 2 }), // wholesale/supplier cost (for margin reporting, never shown to customers)
  vgPgRatio: text('vg_pg_ratio').default('70/30'),
  flavorProfile: text('flavor_profile').default(''),
  images: jsonb('images').$type<string[]>().default([]),
  tags: jsonb('tags').$type<string[]>().default([]),
  isActive: boolean('is_active').notNull().default(true),
});

export const productVariants = pgTable('product_variants', {
  id: serial('id').primaryKey(),
  productId: integer('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  sku: text('sku').notNull().unique(),
  barcode: text('barcode'), // EAN/UPC scanned at POS; unique if set
  flavor: text('flavor').default(''),
  nicotineStrength: text('nicotine_strength').default('0mg'),
  bottleSize: text('bottle_size').default('10ml'),
  color: text('color').default('#14b8a6'),
  priceOverride: numeric('price_override', { precision: 10, scale: 2 }),
  stockQuantity: integer('stock_quantity').notNull().default(0),
  lowStockThreshold: integer('low_stock_threshold').notNull().default(5),
  isActive: boolean('is_active').notNull().default(true),
  // Stock control: stockQuantity is the single on-hand record shared by web + till.
  // reservedQuantity = units held for in-progress web checkouts (available = stock - reserved).
  reservedQuantity: integer('reserved_quantity').notNull().default(0),
  unitCost: numeric('unit_cost', { precision: 10, scale: 2 }), // supplier cost per unit
  supplierId: integer('supplier_id'),
});

export const addresses = pgTable('addresses', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }),
  label: text('label').default('Home'),
  line1: text('line1').notNull(),
  line2: text('line2').default(''),
  city: text('city').notNull(),
  postcode: text('postcode').notNull(),
  county: text('county').default(''),
  isDefault: boolean('is_default').default(false),
});

export const promoCodes = pgTable('promo_codes', {
  id: serial('id').primaryKey(),
  code: text('code').notNull().unique(),
  type: text('type').notNull().default('percent'), // percent | fixed | shipping
  value: numeric('value', { precision: 10, scale: 2 }).notNull().default('0'),
  minSpend: numeric('min_spend', { precision: 10, scale: 2 }).default('0'),
  usageLimit: integer('usage_limit'),
  timesUsed: integer('times_used').default(0).notNull(),
  active: boolean('active').notNull().default(true),
  expiresAt: timestamp('expires_at'),
});

export const orders = pgTable('orders', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id),
  guestEmail: text('guest_email'),
  status: text('status').notNull().default('pending'), // pending|paid|processing|ready|shipped|collected|cancelled|refunded
  subtotal: numeric('subtotal', { precision: 10, scale: 2 }).notNull().default('0'),
  discount: numeric('discount', { precision: 10, scale: 2 }).notNull().default('0'),
  shippingCost: numeric('shipping_cost', { precision: 10, scale: 2 }).notNull().default('0'),
  totalAmount: numeric('total_amount', { precision: 10, scale: 2 }).notNull().default('0'),
  shippingAddress: jsonb('shipping_address'),
  collectionMode: text('collection_mode').notNull().default('delivery'), // delivery | collect
  paymentGateway: text('payment_gateway').default('mock'),
  paymentIntentId: text('payment_intent_id'),
  paymentStatus: text('payment_status').notNull().default('pending'), // pending|paid|failed|refunded
  trackingNumber: text('tracking_number'),
  carrier: text('carrier'),
  dobVerified: boolean('dob_verified').default(false),
  complianceAccepted: boolean('compliance_accepted').default(false),
  promoCode: text('promo_code'),
  source: text('source').notNull().default('online'), // online | pos (in-store sale at the till)
  paymentMethod: text('payment_method'), // cash | card | split:... | recorded_card (for POS); null for online
  staffNote: text('staff_note'),
  parentOrderId: integer('parent_order_id'), // for returns/exchanges: links back to the original sale
  refundReason: text('refund_reason'),
  paymentBreakdown: jsonb('payment_breakdown').$type<{ method: string; amount: number }[]>(), // split payments
  cashTendered: numeric('cash_tendered', { precision: 10, scale: 2 }),
  changeGiven: numeric('change_given', { precision: 10, scale: 2 }),
  receiptEmailedTo: text('receipt_emailed_to'),
  // NOTE: emails_sent_at column is added lazily via ALTER TABLE on first use (see order-emails.ts).
  // so first deploy after adding email features doesn't require a manual migration.
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const orderItems = pgTable('order_items', {
  id: serial('id').primaryKey(),
  orderId: integer('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
  variantId: integer('variant_id').references(() => productVariants.id),
  productName: text('product_name').notNull(),
  variantLabel: text('variant_label').notNull(),
  sku: text('sku').notNull(),
  quantity: integer('quantity').notNull(),
  unitPrice: numeric('unit_price', { precision: 10, scale: 2 }).notNull(),
});

// Held (paused) POS baskets — lets staff save a sale mid-transaction and resume
// it later (e.g. customer forgot their wallet, or another customer needs serving).
export const heldBaskets = pgTable('held_baskets', {
  id: serial('id').primaryKey(),
  holdCode: text('hold_code').notNull().unique(), // human code like H1234
  customerLabel: text('customer_label'),
  items: jsonb('items').notNull().$type<{ variantId: number; quantity: number; unitPrice?: number; lineDiscount?: number; lineDiscountPct?: number; label?: string; name?: string; sku?: string }[]>(),
  discount: numeric('discount', { precision: 10, scale: 2 }).default('0'),
  discountPct: numeric('discount_pct', { precision: 5, scale: 2 }).default('0'),
  note: text('note'),
  heldBy: text('held_by'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  resumedAt: timestamp('resumed_at'),
});

export const payments = pgTable('payments', {
  id: serial('id').primaryKey(),
  orderId: integer('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
  gateway: text('gateway').notNull(),
  gatewayTransactionId: text('gateway_transaction_id'),
  amount: numeric('amount', { precision: 10, scale: 2 }).notNull(),
  status: text('status').notNull(),
  raw: jsonb('raw'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ---------------- Stock control ----------------
// Every change to product_variants.stock_quantity goes through lib/stock.ts,
// which writes a row here (who, when, why, how much, before/after).
export const stockMovements = pgTable('stock_movements', {
  id: serial('id').primaryKey(),
  variantId: integer('variant_id').notNull(),
  delta: integer('delta').notNull(),
  qtyBefore: integer('qty_before').notNull(),
  qtyAfter: integer('qty_after').notNull(),
  reason: text('reason').notNull(), // sale_online | sale_till | return | delivery | damage | loss | stock_count | recall | correction
  actor: text('actor').notNull(),
  note: text('note'),
  orderId: integer('order_id'),
  poId: integer('po_id'),
  stocktakeId: integer('stocktake_id'),
  batchId: integer('batch_id'),
  refKey: text('ref_key'), // idempotency key: a given business event applies at most once
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const stockReservations = pgTable('stock_reservations', {
  id: serial('id').primaryKey(),
  orderId: integer('order_id').notNull(),
  variantId: integer('variant_id').notNull(),
  quantity: integer('quantity').notNull(),
  status: text('status').notNull().default('active'), // active | consumed | released
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const stockBatches = pgTable('stock_batches', {
  id: serial('id').primaryKey(),
  variantId: integer('variant_id').notNull(),
  batchCode: text('batch_code').notNull(),
  expiryDate: text('expiry_date'), // YYYY-MM-DD
  qtyReceived: integer('qty_received').notNull(),
  qtyRemaining: integer('qty_remaining').notNull(),
  unitCost: numeric('unit_cost', { precision: 10, scale: 2 }),
  poId: integer('po_id'),
  receivedAt: timestamp('received_at').defaultNow().notNull(),
  recalled: boolean('recalled').notNull().default(false),
});

export const suppliers = pgTable('suppliers', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  contactName: text('contact_name'),
  email: text('email'),
  phone: text('phone'),
  accountRef: text('account_ref'),
  leadTimeDays: integer('lead_time_days').notNull().default(7),
  notes: text('notes'),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const purchaseOrders = pgTable('purchase_orders', {
  id: serial('id').primaryKey(),
  poNumber: text('po_number').notNull().unique(),
  supplierId: integer('supplier_id').notNull(),
  status: text('status').notNull().default('draft'), // draft | sent | part_received | received | cancelled
  expectedAt: timestamp('expected_at'),
  notes: text('notes'),
  createdBy: text('created_by'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  sentAt: timestamp('sent_at'),
});

export const purchaseOrderLines = pgTable('purchase_order_lines', {
  id: serial('id').primaryKey(),
  poId: integer('po_id').notNull(),
  variantId: integer('variant_id').notNull(),
  quantityOrdered: integer('quantity_ordered').notNull(),
  quantityReceived: integer('quantity_received').notNull().default(0),
  unitCost: numeric('unit_cost', { precision: 10, scale: 2 }).notNull().default('0'),
});

export const stocktakes = pgTable('stocktakes', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  kind: text('kind').notNull().default('partial'), // full | partial
  status: text('status').notNull().default('open'), // open | completed
  startedBy: text('started_by'),
  startedAt: timestamp('started_at').defaultNow().notNull(),
  completedBy: text('completed_by'),
  completedAt: timestamp('completed_at'),
});

export const stocktakeCounts = pgTable('stocktake_counts', {
  id: serial('id').primaryKey(),
  stocktakeId: integer('stocktake_id').notNull(),
  variantId: integer('variant_id').notNull(),
  expectedQty: integer('expected_qty').notNull().default(0),
  countedQty: integer('counted_qty'),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => ({
  stocktakeVariantUq: uniqueIndex('stocktake_counts_stocktake_variant_uq').on(t.stocktakeId, t.variantId),
}));
