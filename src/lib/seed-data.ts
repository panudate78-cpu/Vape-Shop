export const seedCategories = [
  { name: 'E-Liquids', slug: 'e-liquids', description: 'Shortfills, nic salts and 10ml TPD e-liquids.' },
  { name: 'Pod Systems', slug: 'pod-systems', description: 'Beginner-friendly refillable pod kits and disposables.' },
  { name: 'Mods & Kits', slug: 'mods-kits', description: 'Sub-ohm kits and advanced mods.' },
  { name: 'Coils & Tanks', slug: 'coils-tanks', description: 'Replacement coils and sub-ohm tanks.' },
  { name: 'Accessories', slug: 'accessories', description: 'Batteries, chargers, cases, lanyards & gear.' },
];

export const seedProducts: Array<{
  name: string;
  brand: string;
  categorySlug: string;
  description: string;
  basePrice: number;
  vgPgRatio: string;
  flavorProfile: string;
  tags: string[];
  image?: string;
  variants: Array<{ flavor: string; nic: string; size: string; color?: string; price?: number; stock: number }>;
}> = [
  {
    name: 'Lost Mary BM600',
    brand: 'Lost Mary',
    categorySlug: 'pod-systems',
    description: 'Compact pre-filled disposable with mesh coil for a smooth MTL draw. 20mg nic salt, TPD-compliant.',
    basePrice: 5.99, vgPgRatio: '50/50', flavorProfile: 'Fruit', tags: ['bestseller'],
    variants: [
      { flavor: 'Blueberry Sour Raspberry', nic: '20mg', size: '600 puffs', color: '#4f46e5', stock: 40 },
      { flavor: 'Watermelon Ice', nic: '20mg', size: '600 puffs', color: '#16a34a', stock: 32 },
      { flavor: 'Triple Melon', nic: '20mg', size: '600 puffs', color: '#f97316', stock: 18 },
      { flavor: 'Cherry Ice', nic: '20mg', size: '600 puffs', color: '#dc2626', stock: 5 },
    ],
  },
  {
    name: 'Elf Bar 600',
    brand: 'Elf Bar',
    categorySlug: 'pod-systems',
    description: 'The UK’s favourite disposable. Up to 600 puffs, 20mg nic salt, TPD-compliant.',
    basePrice: 5.49, vgPgRatio: '50/50', flavorProfile: 'Fruit/Ice', tags: ['popular'],
    variants: [
      { flavor: 'Blue Razz Lemonade', nic: '20mg', size: '600 puffs', color: '#3b82f6', stock: 60 },
      { flavor: 'Strawberry Kiwi', nic: '20mg', size: '600 puffs', color: '#ef4444', stock: 24 },
      { flavor: 'Pink Grapefruit', nic: '20mg', size: '600 puffs', color: '#ec4899', stock: 12 },
    ],
  },
  {
    name: 'Dinner Lady 10ml Nic Salts',
    brand: 'Dinner Lady',
    categorySlug: 'e-liquids',
    description: 'Award-winning UK-made 10ml nic salt e-liquid, perfect for pod kits.',
    basePrice: 3.99, vgPgRatio: '50/50', flavorProfile: 'Dessert/Fruit', tags: [],
    variants: [
      { flavor: 'Lemon Tart', nic: '10mg', size: '10ml', stock: 50 },
      { flavor: 'Lemon Tart', nic: '20mg', size: '10ml', stock: 40 },
      { flavor: 'Strawberry Macaroon', nic: '10mg', size: '10ml', stock: 20 },
      { flavor: 'Berry Blast', nic: '20mg', size: '10ml', stock: 25 },
    ],
  },
  {
    name: 'IVG 10ml',
    brand: 'IVG',
    categorySlug: 'e-liquids',
    description: 'Bold flavours, 50/50 blend, ideal for pod kits. 10ml TPD bottles.',
    basePrice: 3.49, vgPgRatio: '50/50', flavorProfile: 'Fruit/Menthol', tags: [],
    variants: [
      { flavor: 'Riberry Lemonade', nic: '6mg', size: '10ml', stock: 30 },
      { flavor: 'Blue Berg', nic: '6mg', size: '10ml', stock: 28 },
      { flavor: 'Menthol', nic: '12mg', size: '10ml', stock: 4 },
    ],
  },
  {
    name: 'Geekvape Sonder Q Pod Kit',
    brand: 'Geekvape',
    categorySlug: 'pod-systems',
    description: '1000mAh refillable pod kit, MTL+RDTL, top-fill leak-proof pods.',
    basePrice: 19.99, vgPgRatio: '—', flavorProfile: '—', tags: ['new'],
    variants: [
      { flavor: 'Black', nic: '0mg (kit)', size: '1 kit', color: '#111', price: 19.99, stock: 15 },
      { flavor: 'Blue', nic: '0mg (kit)', size: '1 kit', color: '#2563eb', price: 19.99, stock: 10 },
    ],
  },
  {
    name: 'Voopoo Drag S2 Kit',
    brand: 'Voopoo',
    categorySlug: 'mods-kits',
    description: '2500mAh internal battery mod with PnP pod tank — sub-ohm ready.',
    basePrice: 39.99, vgPgRatio: '—', flavorProfile: '—', tags: [],
    variants: [
      { flavor: 'Carbon Fiber', nic: '0mg (kit)', size: '1 kit', color: '#222', price: 39.99, stock: 8 },
      { flavor: 'Forest Green', nic: '0mg (kit)', size: '1 kit', color: '#166534', price: 39.99, stock: 6 },
    ],
  },
  {
    name: 'Smok Nord 5 Replacement Coils',
    brand: 'Smok',
    categorySlug: 'coils-tanks',
    description: '5-pack of replacement mesh coils for the Nord 5 pod kit.',
    basePrice: 11.99, vgPgRatio: '—', flavorProfile: '—', tags: [],
    variants: [
      { flavor: '0.15ohm Meshed', nic: 'n/a', size: '5-pack', stock: 25 },
      { flavor: '0.6ohm Meshed MTL', nic: 'n/a', size: '5-pack', stock: 30 },
    ],
  },
  {
    name: '18650 Battery Pair (Sleeve)',
    brand: 'Sony/Molicel',
    categorySlug: 'accessories',
    description: 'High-drain 18650 cells, sold as a matched pair with free case.',
    basePrice: 12.99, vgPgRatio: '—', flavorProfile: '—', tags: [],
    variants: [
      { flavor: 'Molicel P42A', nic: 'n/a', size: 'pair', stock: 20 },
      { flavor: 'Samsung 30Q', nic: 'n/a', size: 'pair', stock: 14 },
    ],
  },
];

export const seedPromos = [
  { code: 'WELCOME10', type: 'percent', value: '10', minSpend: '0', active: true },
  { code: 'FREESHIP', type: 'shipping', value: '100', minSpend: '30', active: true },
  { code: 'CLOUD20', type: 'percent', value: '20', minSpend: '50', active: true },
];
