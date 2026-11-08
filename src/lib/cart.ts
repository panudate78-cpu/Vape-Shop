import { db } from '@/db';
import { productVariants, products } from '@/db/schema';
import { eq, inArray } from 'drizzle-orm';
import type { CartLine } from './session';

export type CartItem = {
  variantId: number;
  quantity: number;
  sku: string;
  productName: string;
  variantLabel: string;
  unitPrice: number;
  stockQuantity: number;
  productId: number;
  image?: string;
};

export async function resolveCart(lines: CartLine[]): Promise<CartItem[]> {
  if (!lines.length) return [];
  const ids = lines.map((l) => l.variantId);
  const vs = await db
    .select({
      variantId: productVariants.id,
      productId: productVariants.productId,
      sku: productVariants.sku,
      flavor: productVariants.flavor,
      nicotineStrength: productVariants.nicotineStrength,
      bottleSize: productVariants.bottleSize,
      priceOverride: productVariants.priceOverride,
      stockQuantity: productVariants.stockQuantity,
      productName: products.name,
      images: products.images,
      basePrice: products.basePrice,
    })
    .from(productVariants)
    .leftJoin(products, eq(productVariants.productId, products.id))
    .where(inArray(productVariants.id, ids));

  return lines
    .map((l) => {
      const v = vs.find((x) => x.variantId === l.variantId);
      if (!v) return null;
      const price = v.priceOverride != null ? Number(v.priceOverride) : Number(v.basePrice);
      const label = [v.flavor, v.nicotineStrength, v.bottleSize].filter(Boolean).join(' · ') || 'Standard';
      return {
        variantId: v.variantId,
        productId: v.productId,
        sku: v.sku,
        productName: v.productName,
        variantLabel: label,
        unitPrice: price,
        quantity: l.quantity,
        stockQuantity: v.stockQuantity ?? 0,
        image: (v.images as string[] | undefined)?.[0],
      } as CartItem;
    })
    .filter((x): x is CartItem => !!x);
}

export function totals(items: CartItem[], shipping = 0, discount = 0) {
  const subtotal = items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
  const total = Math.max(0, subtotal + shipping - discount);
  return { subtotal, shipping, discount, total };
}
