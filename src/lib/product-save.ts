import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';

// Shared helpers for saving products and variants (used by /api/products and /api/products/[id]).

/** Accepts an https:// (or http://) link, or an image uploaded through /api/upload. */
export function isAllowedImage(url: string): boolean {
  const u = url.trim();
  return /^https?:\/\/[^\s]+$/i.test(u) || /^\/(api\/)?uploads\/[A-Za-z0-9._-]+$/.test(u);
}

/** Returns the first image that is not allowed, or null if all are fine. */
export function firstBadImage(images: unknown): string | null {
  if (!Array.isArray(images)) return null;
  for (const img of images) {
    if (typeof img !== 'string' || !isAllowedImage(img)) return String(img ?? '');
  }
  return null;
}

/**
 * Returns a SKU that is not already used in the database and not reserved by this save.
 * Adds a numeric suffix (-2, -3, ...) if the base SKU is taken.
 */
export async function freeSku(executor: { execute: (q: any) => Promise<any> }, base: string, reserved: Set<string>): Promise<string> {
  let candidate = base;
  let n = 1;
  for (;;) {
    const rows: any = await executor.execute(sql`SELECT 1 FROM product_variants WHERE sku = ${candidate} LIMIT 1`);
    const taken = ((rows as any).rows ?? rows).length > 0;
    if (!taken && !reserved.has(candidate)) {
      reserved.add(candidate);
      return candidate;
    }
    n += 1;
    candidate = `${base}-${n}`;
  }
}

/** Turns a unique-key failure from the database into a clear 409. Returns null for other errors. */
export function duplicateResponse(e: any): NextResponse | null {
  if (e?.code !== '23505') return null;
  const sku = /Key \(sku\)=\(([^)]*)\)/.exec(e.detail || '');
  if (sku) {
    return NextResponse.json(
      { error: `SKU ${sku[1]} is already used by another variant. Change the SKU and save again.` },
      { status: 409 },
    );
  }
  return NextResponse.json(
    { error: 'A barcode or SKU clashes with an existing record. Check the variants and save again.' },
    { status: 409 },
  );
}
