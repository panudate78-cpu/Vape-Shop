import { pgTable, serial, text, integer, numeric, boolean, timestamp, jsonb, doublePrecision } from 'drizzle-orm/pg-core';

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
  flavor: text('flavor').default(''),
  nicotineStrength: text('nicotine_strength').default('0mg'),
  bottleSize: text('bottle_size').default('10ml'),
  color: text('color').default('#14b8a6'),
  priceOverride: numeric('price_override', { precision: 10, scale: 2 }),
  stockQuantity: integer('stock_quantity').notNull().default(0),
  lowStockThreshold: integer('low_stock_threshold').notNull().default(5),
  isActive: boolean('is_active').notNull().default(true),
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
  paymentMethod: text('payment_method'), // cash | card (for POS); null for online
  staffNote: text('staff_note'),
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
