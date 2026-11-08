import { NextResponse } from 'next/server';

function csv(v: unknown): string {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const TEMPLATE_HEADER = [
  'sku',
  'product_name',
  'brand',
  'category',
  'flavor',
  'nicotine_strength',
  'bottle_size',
  'color',
  'stock',
  'price',
  'low_stock_threshold',
  'is_active',
];

// Example rows — commented via leading-comment convention? No, plain data rows
// with obvious example SKUs that start with EXAMPLE- so they're easy to spot
// and delete.
const EXAMPLES: Record<string, string | number>[] = [
  {
    sku: 'EXAMPLE-ELQ-001',
    product_name: 'Blue Razz Lemonade 100ml',
    brand: 'Elq',
    category: 'E-liquids',
    flavor: 'Blue Razz Lemonade',
    nicotine_strength: '0mg',
    bottle_size: '100ml',
    color: '',
    stock: 24,
    price: 14.99,
    low_stock_threshold: 5,
    is_active: 'true',
  },
  {
    sku: 'EXAMPLE-ELQ-NIC10',
    product_name: 'Blue Razz Lemonade 100ml',
    brand: 'Elq',
    category: 'E-liquids',
    flavor: 'Blue Razz Lemonade',
    nicotine_strength: '10mg',
    bottle_size: '100ml',
    color: '',
    stock: 18,
    price: 16.99,
    low_stock_threshold: 5,
    is_active: 'true',
  },
  {
    sku: 'EXAMPLE-NOVO4-BLK',
    product_name: 'SMOK Novo 4 Mini Pod Kit',
    brand: 'SMOK',
    category: 'Pod systems',
    flavor: '',
    nicotine_strength: '',
    bottle_size: '',
    color: 'Black',
    stock: 12,
    price: 24.99,
    low_stock_threshold: 3,
    is_active: 'true',
  },
  {
    sku: 'EXAMPLE-CAL-G3-BLU',
    product_name: 'Uwell Caliburn G3 Pod Kit',
    brand: 'Uwell',
    category: 'Pod systems',
    flavor: '',
    nicotine_strength: '',
    bottle_size: '',
    color: 'Blue',
    stock: 8,
    price: 27.99,
    low_stock_threshold: 3,
    is_active: 'true',
  },
  {
    sku: 'EXAMPLE-COIL-CALG3-08',
    product_name: 'Uwell Caliburn G3 Replacement Coils (4pk)',
    brand: 'Uwell',
    category: 'Coils & tanks',
    flavor: '',
    nicotine_strength: '',
    bottle_size: '',
    color: '0.8ohm',
    stock: 30,
    price: 11.99,
    low_stock_threshold: 10,
    is_active: 'true',
  },
  {
    sku: 'EXAMPLE-BATT-18650-PR',
    product_name: 'Molicel P42A 18650 Battery (pair)',
    brand: 'Molicel',
    category: 'Batteries',
    flavor: '',
    nicotine_strength: '',
    bottle_size: '',
    color: '',
    stock: 40,
    price: 12.99,
    low_stock_threshold: 10,
    is_active: 'true',
  },
];

const INSTRUCTIONS = [
  '# Column guide (lines starting with # are ignored by the importer):',
  '#   sku                  — unique product code; if it matches an existing variant, that variant is UPDATED',
  '#   product_name         — product title (REQUIRED when creating new products)',
  '#   brand                — brand name (defaults to "House Brand" if blank)',
  '#   category             — category name, e.g. "E-liquids", "Pod systems", "Coils & tanks", "Batteries", "Accessories", "Mods & kits" (created if missing; uses existing case-insensitive match)',
  '#   flavor               — flavour/variant name',
  '#   nicotine_strength    — e.g. "0mg", "3mg", "10mg", "20mg"',
  '#   bottle_size          — e.g. "10ml", "50ml", "100ml"',
  '#   color                — colour OR resistance (e.g. "0.8ohm") for non-e-liquid items',
  '#   stock                — integer quantity on hand (defaults to 0)',
  '#   price                — GBP price e.g. 14.99 (optional when updating; keeps existing price if blank)',
  '#   low_stock_threshold  — alert level, defaults to 10',
  '#   is_active            — true/false, defaults to true; set false to hide from shop',
  '# Delete or replace the EXAMPLE-* rows before uploading.',
  '# IMPORTANT: for multiple variants (nic strengths/colours/flavours) of the SAME product, repeat product_name+brand+category on every row.',
  '',
];

export async function GET() {
  // Publicly downloadable template — no admin check needed for a blank CSV,
  // but keep it inside /admin so only people who can reach the dashboard
  // discover it.
  const lines: string[] = [];
  lines.push(...INSTRUCTIONS);
  lines.push(TEMPLATE_HEADER.map(csv).join(','));
  for (const row of EXAMPLES) {
    lines.push(TEMPLATE_HEADER.map((h) => csv(row[h] ?? '')).join(','));
  }
  const body = lines.join('\r\n');
  return new NextResponse(body, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="dr-cloud-inventory-template.csv"',
    },
  });
}
