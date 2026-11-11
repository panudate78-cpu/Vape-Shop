// Unit cost used for reporting. Rule: the variant's supplier unit cost if it is set,
// otherwise the product's cost price, otherwise unknown (null). Unknown costs are reported, never guessed as zero.
import { db } from '@/db';
import { productVariants, products } from '@/db/schema';
import { eq, inArray } from 'drizzle-orm';

export async function currentCostMap(variantIds: number[]): Promise<Map<number, number | null>> {
  const map = new Map<number, number | null>();
  const ids = [...new Set(variantIds.filter((x) => Number.isFinite(x)))];
  if (!ids.length) return map;
  const rows = await db
    .select({ id: productVariants.id, unitCost: productVariants.unitCost, productCost: products.costPrice })
    .from(productVariants)
    .leftJoin(products, eq(products.id, productVariants.productId))
    .where(inArray(productVariants.id, ids));
  for (const r of rows) {
    map.set(r.id, r.unitCost != null ? Number(r.unitCost) : r.productCost != null ? Number(r.productCost) : null);
  }
  return map;
}

// Value to store on an order line: a 2-dp string, or null when the cost is unknown.
export function costForLine(costs: Map<number, number | null>, variantId: number | null | undefined): string | null {
  if (variantId == null) return null;
  const c = costs.get(variantId);
  return c == null ? null : c.toFixed(2);
}
