import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  numeric,
  boolean,
  timestamp,
  date,
  jsonb,
  pgEnum,
} from "drizzle-orm/pg-core";

export const roleEnum = pgEnum("role", ["CUSTOMER", "ADMIN"]);
export const orderStatusEnum = pgEnum("order_status", [
  "pending",
  "paid",
  "processing",
  "shipped",
  "cancelled",
  "refunded",
]);
export const paymentStatusEnum = pgEnum("payment_status", [
  "pending",
  "authorized",
  "captured",
  "failed",
  "refunded",
]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: roleEnum("role").notNull().default("CUSTOMER"),
  fullName: varchar("full_name", { length: 255 }),
  dob: date("dob"),
  phone: varchar("phone", { length: 50 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const categories = pgTable("categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 120 }).notNull(),
  slug: varchar("slug", { length: 120 }).notNull().unique(),
  description: text("description"),
  image: text("image"),
});

export const products = pgTable("products", {
  id: uuid("id").primaryKey().defaultRandom(),
  categoryId: uuid("category_id").references(() => categories.id, { onDelete: "set null" }),
  name: varchar("name", { length: 255 }).notNull(),
  brand: varchar("brand", { length: 120 }).notNull().default("House Brand"),
  description: text("description"),
  basePrice: numeric("base_price", { precision: 10, scale: 2 }).notNull().default("0"),
  vgPgRatio: varchar("vg_pg_ratio", { length: 20 }).default("50/50"),
  flavorProfile: varchar("flavor_profile", { length: 80 }),
  images: jsonb("images").$type<string[]>().default([]),
  tags: jsonb("tags").$type<string[]>().default([]),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const productVariants = pgTable("product_variants", {
  id: uuid("id").primaryKey().defaultRandom(),
  productId: uuid("product_id")
    .references(() => products.id, { onDelete: "cascade" })
    .notNull(),
  sku: varchar("sku", { length: 80 }).notNull().unique(),
  flavor: varchar("flavor", { length: 120 }),
  nicotineStrength: varchar("nicotine_strength", { length: 20 }),
  bottleSize: varchar("bottle_size", { length: 20 }),
  color: varchar("color", { length: 60 }),
  priceOverride: numeric("price_override", { precision: 10, scale: 2 }),
  stockQuantity: integer("stock_quantity").notNull().default(0),
  lowStockThreshold: integer("low_stock_threshold").notNull().default(10),
  isActive: boolean("is_active").notNull().default(true),
});

export const promoCodes = pgTable("promo_codes", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: varchar("code", { length: 40 }).notNull().unique(),
  type: varchar("type", { length: 20 }).notNull().default("percent"),
  value: numeric("value", { precision: 10, scale: 2 }).notNull().default("0"),
  minOrder: numeric("min_order", { precision: 10, scale: 2 }).default("0"),
  usageLimit: integer("usage_limit"),
  usedCount: integer("used_count").notNull().default(0),
  expiresAt: timestamp("expires_at"),
  isActive: boolean("is_active").notNull().default(true),
});

export const addresses = pgTable("addresses", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  label: varchar("label", { length: 60 }).default("Home"),
  fullName: varchar("full_name", { length: 255 }),
  line1: varchar("line1", { length: 255 }),
  line2: varchar("line2", { length: 255 }),
  city: varchar("city", { length: 120 }),
  postcode: varchar("postcode", { length: 30 }),
  country: varchar("country", { length: 80 }).default("United Kingdom"),
  phone: varchar("phone", { length: 50 }),
  isDefault: boolean("is_default").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const orders = pgTable("orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  guestEmail: varchar("guest_email", { length: 255 }),
  status: orderStatusEnum("status").notNull().default("pending"),
  subtotal: numeric("subtotal", { precision: 10, scale: 2 }).notNull().default("0"),
  discount: numeric("discount", { precision: 10, scale: 2 }).notNull().default("0"),
  shippingCost: numeric("shipping_cost", { precision: 10, scale: 2 }).notNull().default("0"),
  totalAmount: numeric("total_amount", { precision: 10, scale: 2 }).notNull().default("0"),
  shippingAddress: jsonb("shipping_address").$type<Record<string, unknown>>().default({}),
  paymentGateway: varchar("payment_gateway", { length: 40 }).default("mock"),
  paymentIntentId: varchar("payment_intent_id", { length: 255 }),
  paymentStatus: paymentStatusEnum("payment_status").default("pending"),
  trackingNumber: varchar("tracking_number", { length: 120 }),
  carrier: varchar("carrier", { length: 80 }),
  dobVerified: boolean("dob_verified").default(false),
  complianceAccepted: boolean("compliance_accepted").default(false),
  promoCode: varchar("promo_code", { length: 40 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const orderItems = pgTable("order_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id")
    .references(() => orders.id, { onDelete: "cascade" })
    .notNull(),
  variantId: uuid("variant_id").references(() => productVariants.id, { onDelete: "set null" }),
  productName: varchar("product_name", { length: 255 }),
  variantLabel: varchar("variant_label", { length: 255 }),
  sku: varchar("sku", { length: 80 }),
  quantity: integer("quantity").notNull().default(1),
  unitPrice: numeric("unit_price", { precision: 10, scale: 2 }).notNull().default("0"),
});

export const payments = pgTable("payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id").references(() => orders.id, { onDelete: "cascade" }),
  gateway: varchar("gateway", { length: 40 }).notNull().default("mock"),
  intentId: varchar("intent_id", { length: 255 }),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull().default("0"),
  status: paymentStatusEnum("status").notNull().default("pending"),
  raw: jsonb("raw").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type Product = typeof products.$inferSelect;
export type ProductVariant = typeof productVariants.$inferSelect;
export type Order = typeof orders.$inferSelect;
