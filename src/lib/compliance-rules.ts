// Pure rules for vape products: classification, product-specific age prompts,
// and the product checks the shop records. No database access here, so these
// can be unit-tested directly.
//
// These tools support the shop's procedures. They do not guarantee legal
// compliance. The rules below are the ones the shop has asked the software to
// enforce; the developer and shop must verify them against current law and
// guidance (see the notes in the compliance admin page).

export const PRODUCT_KINDS = {
  device: 'Device (refillable tank or pod kit)',
  replacement_pod: 'Replacement pod',
  coil: 'Replacement coil',
  liquid: 'E-liquid or nicotine shot',
  accessory: 'Accessory (not a vape product)',
  disposable: 'Single-use / disposable (banned for sale)',
  unclassified: 'Not classified yet',
} as const;
export type ProductKind = keyof typeof PRODUCT_KINDS;

export const ID_TYPES: Record<string, string> = {
  passport: 'Passport',
  uk_photocard_licence: 'UK photocard driving licence',
  pass_card: 'PASS-accredited proof of age card',
  armed_forces: 'UK Armed Forces ID card',
  other: 'Other accepted ID',
};

export const REFUSAL_REASONS: Record<string, string> = {
  no_id: 'No acceptable ID shown',
  under_18: 'Appears under 18 or ID shows under 18',
  refused_id: 'Customer refused to show ID',
  proxy_suspected: 'Suspected buying for someone under 18',
  intoxicated: 'Appears intoxicated',
  other: 'Other (note required)',
};

// Kinds where the age-of-sale rules apply. Accessories are not restricted by default,
// but every product is restricted unless the shop explicitly marks it otherwise.
export function isRestrictedByKind(kind: string, ageRestricted: boolean | null | undefined): boolean {
  if (kind === 'accessory') return ageRestricted === true;
  return ageRestricted !== false; // unknown or unclassified stays restricted (fail safe)
}

export function parseMg(text: string | null | undefined): number | null {
  if (!text) return null;
  const m = String(text).match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
}

export function parseMl(text: string | null | undefined): number | null {
  if (!text) return null;
  const m = String(text).match(/\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
}

// Product-specific wording for the till. Every vape product is 18+; the wording says what it is.
export function agePrompt(kind: string, nicotineMgMl?: number | null, name?: string): string {
  const who = name ? `${name}: ` : '';
  switch (kind) {
    case 'disposable':
      return `${who}single-use vapes cannot be sold. Remove this item from the sale.`;
    case 'liquid':
      return nicotineMgMl && nicotineMgMl > 0
        ? `${who}nicotine e-liquid. 18+ only. Ask for photo ID if the customer looks under 25 (Challenge 25).`
        : `${who}0mg e-liquid is still 18+ only. Ask for photo ID if the customer looks under 25 (Challenge 25).`;
    case 'device':
      return `${who}vape device. 18+ only. Ask for photo ID if the customer looks under 25 (Challenge 25).`;
    case 'replacement_pod':
      return `${who}replacement pod. 18+ only. Ask for photo ID if the customer looks under 25 (Challenge 25).`;
    case 'coil':
      return `${who}replacement coil. 18+ only. Ask for photo ID if the customer looks under 25 (Challenge 25).`;
    default:
      return `${who}age-restricted item (not yet classified). 18+ only. Ask for photo ID if the customer looks under 25.`;
  }
}

export type ComplianceRecordFacts = {
  mhraNotificationRef?: string | null;
  batchNumber?: string | null;
  nicotineMgMl?: number | string | null;
  bottleMl?: number | string | null;
  tankMl?: number | string | null;
  childResistant?: boolean | null;
  tamperEvident?: boolean | null;
  labelCheckedAt?: Date | string | null;
} | null;

export type ComplianceDocFacts = { kind: string; title: string; expiresAt?: Date | string | null };

export type VariantFacts = {
  productKind: string;
  nicotineStrength?: string | null; // e.g. "18mg", "0mg"
  bottleSize?: string | null;       // e.g. "10ml"
  name?: string;
};

export type ComplianceIssues = {
  // Recorded facts that break a rule. These stop new sales.
  violations: string[];
  // Information the shop has not recorded yet. These are shown as to-dos and do not stop sales.
  missing: string[];
  warnings: string[];
};

const num = (v: number | string | null | undefined) => (v === null || v === undefined || v === '' ? null : Number(v));

export function complianceIssues(v: VariantFacts, rec: ComplianceRecordFacts, docs: ComplianceDocFacts[] = [], now = new Date()): ComplianceIssues {
  const violations: string[] = [];
  const missing: string[] = [];
  const warnings: string[] = [];
  const nic = parseMg(v.nicotineStrength) ?? 0;
  const bottle = parseMl(v.bottleSize);
  const kind = v.productKind;
  const hasNicotine = nic > 0;

  if (kind === 'unclassified') missing.push('Choose the product type.');
  if (kind === 'disposable') violations.push('Single-use (disposable) vapes cannot be sold in the UK (ban in force since 1 June 2025).');

  // Recorded facts vs the TRPR 2016 product limits (reg 36). Confirm the limits against current law.
  if (hasNicotine && nic > 20) violations.push(`Nicotine ${nic}mg/ml is above the 20mg/ml limit for retail sale.`);
  if (hasNicotine && kind === 'liquid' && bottle !== null && bottle > 10) violations.push(`Nicotine liquid in a ${bottle}ml container is above the 10ml limit.`);
  const tank = num(rec?.tankMl);
  if (tank !== null && tank > 2) violations.push(`Tank capacity ${tank}ml is above the 2ml limit.`);

  if (rec) {
    if (rec.nicotineMgMl !== null && rec.nicotineMgMl !== undefined && num(rec.nicotineMgMl)! > 20) {
      violations.push(`Recorded nicotine ${rec.nicotineMgMl}mg/ml is above the 20mg/ml limit.`);
    }
  } else {
    missing.push('Compliance record not created (nicotine, container and tank sizes, MHRA reference, child resistance, label check).');
  }

  // Information the shop must hold for nicotine products.
  if (hasNicotine && !(rec?.mhraNotificationRef)) {
    if (kind === 'liquid') missing.push('MHRA notification reference missing (nicotine e-liquid).');
    else warnings.push('Confirm the MHRA notification for this nicotine product and record its reference.');
  }
  if (kind === 'liquid' || kind === 'replacement_pod' || kind === 'device') {
    if (!rec?.childResistant) missing.push('Child-resistant packaging not confirmed.');
    if (!rec?.tamperEvident) warnings.push('Tamper-evident packaging not confirmed.');
  }
  if (!rec?.labelCheckedAt) warnings.push('Label check not recorded (nicotine content, health warning, ingredients, batch).');
  if (!rec?.batchNumber) warnings.push('No batch number recorded for this stock.');
  if (!docs.length) warnings.push('No supplier documents linked.');
  for (const d of docs) {
    if (d.expiresAt && new Date(d.expiresAt) < now) warnings.push(`Document expired: ${d.title}.`);
  }

  return { violations, missing, warnings };
}

export function hasViolations(issues: ComplianceIssues) {
  return issues.violations.length > 0;
}
