// Database side of the compliance tools: the sale gate (blocks, recorded violations,
// age-check requirement), age-check recording, and handover checks.
import { db } from '@/db';
import { productVariants, products, complianceRecords, complianceDocuments, productBlocks, ageChecks } from '@/db/schema';
import { and, eq, inArray, or, sql } from 'drizzle-orm';
import { agePrompt, complianceIssues, isRestrictedByKind, parseMg, REFUSAL_REASONS, ID_TYPES } from './compliance-rules';

export class ComplianceError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

export type SaleGate = {
  restrictedIds: number[];        // variants that need an age check before sale
  restrictedNames: string[];      // for the till prompt
  prompts: string[];              // product-specific prompts, one per restricted variant
  names: Map<number, string>;
};

// Checks every variant in a sale. Throws ComplianceError when the sale must not go ahead.
// - an active block or recall on the variant or its product stops the sale
// - recorded violations (banned kind, nicotine above limit, container above limit) stop the sale
// Missing information is NOT a hard stop; it is shown to managers as a to-do list.
export async function saleGate(variantIds: number[]): Promise<SaleGate> {
  const ids = [...new Set(variantIds)];
  const empty: SaleGate = { restrictedIds: [], restrictedNames: [], prompts: [], names: new Map() };
  if (!ids.length) return empty;

  const vs = await db
    .select({
      id: productVariants.id,
      productId: productVariants.productId,
      productKind: productVariants.productKind,
      nicotineStrength: productVariants.nicotineStrength,
      bottleSize: productVariants.bottleSize,
      ageRestricted: productVariants.ageRestricted,
      sku: productVariants.sku,
      productName: products.name,
    })
    .from(productVariants)
    .leftJoin(products, eq(products.id, productVariants.productId))
    .where(inArray(productVariants.id, ids));

  const productIds = [...new Set(vs.map((v) => v.productId))];
  const recs = await db.select().from(complianceRecords).where(inArray(complianceRecords.variantId, ids));
  const recByVariant = new Map(recs.map((r) => [r.variantId, r]));

  const blocks = await db.select().from(productBlocks).where(and(
    eq(productBlocks.status, 'active'),
    or(
      and(eq(productBlocks.scope, 'variant'), inArray(productBlocks.variantId, ids)),
      and(eq(productBlocks.scope, 'product'), inArray(productBlocks.productId, productIds)),
    ),
  ));

  const names = new Map<number, string>();
  const restrictedIds: number[] = [];
  const restrictedNames: string[] = [];
  const prompts: string[] = [];
  const now = new Date();

  for (const v of vs) {
    const label = `${v.productName ?? 'Product'} (${v.sku})`;
    names.set(v.id, label);
    const block = blocks.find((b) => (b.scope === 'variant' && b.variantId === v.id) || (b.scope === 'product' && b.productId === v.productId));
    if (block) {
      throw new ComplianceError(409, 'BLOCKED',
        `${label} is ${block.kind === 'recall' ? 'recalled' : 'on stop-sale'}: ${block.reason}`);
    }
    const rec = recByVariant.get(v.id) ?? null;
    const issues = complianceIssues(
      { productKind: v.productKind, nicotineStrength: v.nicotineStrength, bottleSize: v.bottleSize, name: v.productName ?? undefined },
      rec ? { ...rec, labelCheckedAt: rec.labelCheckedAt } : null,
      [],
      now,
    );
    if (issues.violations.length) {
      throw new ComplianceError(409, 'NOT_COMPLIANT', `${label} cannot be sold: ${issues.violations.join(' ')}`);
    }
    if (isRestrictedByKind(v.productKind, v.ageRestricted)) {
      restrictedIds.push(v.id);
      restrictedNames.push(label);
      prompts.push(agePrompt(v.productKind, parseMg(v.nicotineStrength), v.productName ?? undefined));
    }
  }
  return { restrictedIds, restrictedNames, prompts, names };
}

export type AgeCheckRow = {
  channel: 'till' | 'collection' | 'delivery' | 'online';
  result: 'passed' | 'refused';
  method: 'id_seen' | 'appearance' | 'third_party' | 'dob_declared';
  idType?: string | null;
  reasonCode?: string | null;
  note?: string | null;
  staffName?: string | null;
  register?: string | null;
  orderId?: number | null;
  saleOrderId?: number | null;
  customerEmail?: string | null;
  userId?: number | null;
  productSummary?: string | null;
};

// Works with the database or a transaction. Refusals must be written even when no sale is created.
export async function recordAgeCheck(exec: any, row: AgeCheckRow) {
  if (row.result === 'refused' && !row.reasonCode) throw new ComplianceError(400, 'REASON_REQUIRED', 'Choose a refusal reason.');
  if (row.reasonCode && !REFUSAL_REASONS[row.reasonCode]) throw new ComplianceError(400, 'BAD_REASON', 'Unknown refusal reason.');
  if (row.idType && !ID_TYPES[row.idType]) throw new ComplianceError(400, 'BAD_ID_TYPE', 'Unknown ID type.');
  await exec.insert(ageChecks).values({
    channel: row.channel,
    result: row.result,
    method: row.method,
    idType: row.idType ?? null,
    reasonCode: row.reasonCode ?? null,
    note: row.note?.trim() || null,
    staffName: row.staffName ?? null,
    register: row.register ?? null,
    orderId: row.orderId ?? null,
    saleOrderId: row.saleOrderId ?? null,
    customerEmail: row.customerEmail ?? null,
    userId: row.userId ?? null,
    productSummary: row.productSummary ?? null,
  });
}

// True when an order contains any age-restricted item. A line whose variant has gone
// (deleted) is treated as restricted: the safe default.
export async function orderIsRestricted(exec: any, orderId: number): Promise<boolean> {
  const rows: any = await exec.execute(sql`
    SELECT oi.variant_id AS "variantId", pv.age_restricted AS "ageRestricted", pv.product_kind AS "productKind"
    FROM order_items oi LEFT JOIN product_variants pv ON pv.id = oi.variant_id
    WHERE oi.order_id = ${orderId}`);
  const list: any[] = Array.isArray(rows) ? rows : (rows?.rows ?? []);
  return list.some((r) => r.variantId == null || isRestrictedByKind(r.productKind ?? 'unclassified', r.ageRestricted));
}

// Handover checks for collection or delivery. A check at the till or online
// does not count for the handover itself; only an ID seen at handover or a
// passed third-party online check does. A declared date of birth never counts.
export async function handoverAgeCheckPassed(exec: any, orderId: number, channel: 'collection' | 'delivery'): Promise<boolean> {
  const rows: any = await exec.execute(sql`
    SELECT 1 FROM age_checks
    WHERE order_id = ${orderId} AND result = 'passed'
      AND ((channel = ${channel} AND method = 'id_seen') OR (channel = 'online' AND method = 'third_party'))
    LIMIT 1`);
  const list: any[] = Array.isArray(rows) ? rows : (rows?.rows ?? []);
  return list.length > 0;
}

export async function activeBlocks() {
  return db.select().from(productBlocks).where(eq(productBlocks.status, 'active'));
}

export async function documentsForVariant(variantId: number) {
  return db.select().from(complianceDocuments).where(eq(complianceDocuments.variantId, variantId));
}
