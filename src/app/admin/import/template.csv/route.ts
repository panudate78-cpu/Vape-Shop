import { NextResponse } from 'next/server';

function csv(v: unknown): string {
  const s = String(v ?? '');
  if (/[",\n|]/.test(s) || s.startsWith('http')) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

const TEMPLATE_HEADER = [
  'sku','product_name','brand','category','description','images','cost_price',
  'flavor','nicotine_strength','bottle_size','color','stock','price','low_stock_threshold','is_active'
];

const EXAMPLES: Record<string, string | number>[] = [
  {
    sku:'EXAMPLE-ELQ-001', product_name:'Blue Razz Lemonade 100ml', brand:'Elq', category:'E-liquids',
    description:'Bold blue raspberry paired with zingy lemonade. 70/30 VG/PG, great for sub-ohm kits.',
    images:'https://example.com/images/blue-razz.jpg|https://example.com/images/blue-razz-side.jpg',
    cost_price:4.50, flavor:'Blue Razz Lemonade', nicotine_strength:'0mg', bottle_size:'100ml', color:'',
    stock:24, price:14.99, low_stock_threshold:5, is_active:'true',
  },
  {
    sku:'EXAMPLE-ELQ-NIC10', product_name:'Blue Razz Lemonade 100ml', brand:'Elq', category:'E-liquids',
    description:'', images:'', cost_price:5.00, flavor:'Blue Razz Lemonade', nicotine_strength:'10mg',
    bottle_size:'100ml', color:'', stock:18, price:16.99, low_stock_threshold:5, is_active:'true',
  },
  {
    sku:'EXAMPLE-NOVO4-BLK', product_name:'SMOK Novo 4 Mini Pod Kit', brand:'SMOK', category:'Pod systems',
    description:'Compact 25W pod kit with 2ml pod, adjustable airflow, USB-C charging.',
    images:'https://example.com/images/novo4-black.jpg', cost_price:11.00, flavor:'', nicotine_strength:'',
    bottle_size:'', color:'Black', stock:12, price:24.99, low_stock_threshold:3, is_active:'true',
  },
  {
    sku:'EXAMPLE-CAL-G3-BLU', product_name:'Uwell Caliburn G3 Pod Kit', brand:'Uwell', category:'Pod systems',
    description:'', images:'', cost_price:13.00, flavor:'', nicotine_strength:'', bottle_size:'', color:'Blue',
    stock:8, price:27.99, low_stock_threshold:3, is_active:'true',
  },
  {
    sku:'EXAMPLE-COIL-CALG3-08', product_name:'Uwell Caliburn G3 Replacement Coils (4pk)', brand:'Uwell', category:'Coils & tanks',
    description:'Replacement coils for Caliburn G3 / G3 Lite pods. Pack of 4.', images:'', cost_price:4.80,
    flavor:'', nicotine_strength:'', bottle_size:'', color:'0.8ohm', stock:30, price:11.99, low_stock_threshold:10, is_active:'true',
  },
  {
    sku:'EXAMPLE-BATT-18650-PR', product_name:'Molicel P42A 18650 Battery (pair)', brand:'Molicel', category:'Batteries',
    description:'High-drain 4200mAh 18650 cells, sold as a matched pair.', images:'', cost_price:5.50,
    flavor:'', nicotine_strength:'', bottle_size:'', color:'', stock:40, price:12.99, low_stock_threshold:10, is_active:'true',
  },
];

const INSTRUCTIONS = [
  '# Column guide (lines starting with # are ignored):',
  '#   sku                  — unique product code; matches existing = UPDATE',
  '#   product_name         — title (REQUIRED for new products); repeat for every variant',
  '#   brand                — brand name (defaults to "House Brand")',
  '#   category             — e.g. "E-liquids", "Pod systems", "Coils & tanks", "Batteries", "Accessories", "Mods & kits" (auto-created)',
  '#   description          — product sales copy; only needed on the FIRST row of each product',
  '#   images               — pipe-separated (|) URLs; first = MAIN image',
  '#   cost_price           — YOUR wholesale cost in GBP (not shown to customers; margin tracking)',
  '#   flavor / nicotine_strength / bottle_size / color — variant attributes',
  '#   stock                — integer quantity (defaults to 0)',
  '#   price                — retail GBP e.g. 14.99 (optional for updates)',
  '#   low_stock_threshold  — alert level (default 10)',
  '#   is_active            — true/false (false hides from shop)',
  '#',
  '# Delete/replace EXAMPLE-* rows. Tip: export first, edit, re-import.',
  '',
];

export async function GET() {
  const lines: string[] = [...INSTRUCTIONS, TEMPLATE_HEADER.map(csv).join(',')];
  for (const row of EXAMPLES) lines.push(TEMPLATE_HEADER.map((h) => csv(row[h] ?? '')).join(','));
  return new NextResponse(lines.join('\r\n'), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="dr-cloud-inventory-template.csv"',
    },
  });
}
