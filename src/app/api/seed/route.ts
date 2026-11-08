import { NextResponse } from "next/server";
import { db } from "@/db";
import { users, categories, products, productVariants, promoCodes } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { hashPassword } from "@/lib/auth";
import { seedCategories, seedProducts, seedPromos } from "@/lib/seed-data";

export async function POST() {
  try {
    const existing = await db.select().from(products).limit(1);
    if (existing.length) {
      return NextResponse.json({ ok: true, seeded: false, message: "Already seeded" });
    }
    // categories
    for (const c of seedCategories) {
      const found = await db.select().from(categories).where(eq(categories.slug, c.slug)).limit(1);
      if (!found.length) await db.insert(categories).values(c);
    }
    const cats = await db.select().from(categories);
    const catBySlug = Object.fromEntries(cats.map((c) => [c.slug, c]));

    const hueGrad: Record<string, string[]> = {
      amber: ["#f59e0b", "#78350f"],
      brown: ["#92400e", "#1c0a00"],
      violet: ["#8b5cf6", "#1e1b4b"],
      slate: ["#64748b", "#020617"],
      steel: ["#94a3b8", "#0f172a"],
      pink: ["#ec4899", "#500724"],
      green: ["#22c55e", "#052e16"],
      cola: ["#b45309", "#09090b"],
    };

    for (const p of seedProducts) {
      const cat = catBySlug[p.category];
      const grad = hueGrad[p.imageHue] || ["#8b5cf6", "#0f172a"];
      const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='800' height='800'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='${grad[0]}'/><stop offset='1' stop-color='${grad[1]}'/></linearGradient></defs><rect width='800' height='800' fill='url(#g)'/><text x='50%' y='46%' font-family='Arial' font-size='64' font-weight='bold' fill='white' text-anchor='middle'>${p.brand}</text><text x='50%' y='56%' font-family='Arial' font-size='36' fill='white' opacity='0.85' text-anchor='middle'>${p.name.slice(0, 28)}</text></svg>`;
      const img = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
      const ins = await db.insert(products).values({
        categoryId: cat?.id || null,
        name: p.name,
        brand: p.brand,
        description: p.description,
        basePrice: String(p.basePrice),
        vgPgRatio: p.vgPg,
        flavorProfile: p.flavorProfile,
        images: [img],
        tags: p.tags,
        isActive: true,
      }).returning();
      const prod = ins[0];
      for (const [idx, v] of p.variants.entries()) {
        const skuBase = `${p.brand.slice(0, 3).toUpperCase()}-${prod.name.split(" ").map((w) => w[0]).join("").slice(0, 3).toUpperCase()}-${idx + 1}`;
        await db.insert(productVariants).values({
          productId: prod.id,
          sku: `${skuBase}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`,
          flavor: v.flavor || null,
          nicotineStrength: v.nicotine || null,
          bottleSize: v.size || null,
          color: v.color || null,
          priceOverride: v.price != null ? String(v.price) : null,
          stockQuantity: v.stock ?? 20,
          lowStockThreshold: 10,
          isActive: true,
        });
      }
    }
    for (const pr of seedPromos) {
      const found = await db.select().from(promoCodes).where(eq(promoCodes.code, pr.code)).limit(1);
      if (!found.length) await db.insert(promoCodes).values({ ...pr, isActive: true } as typeof promoCodes.$inferInsert);
    }
    // admin + demo customer
    const adminEmail = (process.env.ADMIN_EMAIL || "admin@vapeshop.co.uk").toLowerCase();
    const adminExists = await db.select().from(users).where(eq(users.email, adminEmail)).limit(1);
    if (!adminExists.length) {
      await db.insert(users).values({
        email: adminEmail,
        passwordHash: await hashPassword(process.env.ADMIN_PASSWORD || "Admin123!"),
        role: "ADMIN",
        fullName: "Store Admin",
      });
    }
    const demoExists = await db.select().from(users).where(eq(users.email, "demo@customer.co.uk")).limit(1);
    if (!demoExists.length) {
      await db.insert(users).values({
        email: "demo@customer.co.uk",
        passwordHash: await hashPassword("Customer123!"),
        role: "CUSTOMER",
        fullName: "Demo Customer",
      });
    }
    return NextResponse.json({ ok: true, seeded: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Seed failed" }, { status: 500 });
  }
}

export async function GET() {
  return POST();
}
