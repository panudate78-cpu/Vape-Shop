export const seedCategories = [
  { name: "E-Liquids", slug: "e-liquids", description: "Premium shortfills, nic salts & freebase juices." },
  { name: "Pod Systems", slug: "pod-systems", description: "Compact refillable & prefilled pod devices." },
  { name: "Mods & Kits", slug: "mods-kits", description: "Box mods, starter kits & sub-ohm bundles." },
  { name: "Coils & Tanks", slug: "coils-tanks", description: "Replacement coils, pods & tanks." },
  { name: "Accessories", slug: "accessories", description: "Chargers, batteries, drip tips & cases." },
];

type SeedProduct = {
  name: string;
  brand: string;
  category: string;
  description: string;
  basePrice: number;
  vgPg: string;
  flavorProfile: string;
  tags: string[];
  imageHue: string;
  variants: { flavor?: string; nicotine?: string; size?: string; color?: string; price?: number; stock?: number }[];
};

export const seedProducts: SeedProduct[] = [
  {
    name: "Arctic Mango Ice 50ml Shortfill",
    brand: "Frostline",
    category: "e-liquids",
    description: "Ripe mango over crushed ice with a frosty menthol exhale. 70/30 VG/PG, nicotine-free shortfill with room for 2x nic shots.",
    basePrice: 14.99,
    vgPg: "70/30",
    flavorProfile: "Ice",
    tags: ["shortfill", "ice", "bestseller"],
    imageHue: "amber",
    variants: [
      { flavor: "Mango Ice", nicotine: "0mg", size: "50ml", price: 14.99, stock: 84 },
      { flavor: "Mango Ice", nicotine: "3mg", size: "50ml", price: 15.99, stock: 62 },
      { flavor: "Mango Ice", nicotine: "6mg", size: "50ml", price: 15.99, stock: 41 },
      { flavor: "Blue Razz Ice", nicotine: "0mg", size: "50ml", price: 14.99, stock: 55 },
      { flavor: "Blue Razz Ice", nicotine: "3mg", size: "50ml", price: 15.99, stock: 8 },
      { flavor: "Watermelon Chill", nicotine: "0mg", size: "100ml", price: 19.99, stock: 37 },
    ],
  },
  {
    name: "Velvet Custard Tobacco 10ml Nic Salt",
    brand: "Noir Reserve",
    category: "e-liquids",
    description: "Smooth vanilla custard layered over golden Virginia tobacco. 10mg & 20mg nic salts for pod systems. 50/50.",
    basePrice: 4.99,
    vgPg: "50/50",
    flavorProfile: "Tobacco",
    tags: ["nic-salt", "tobacco", "pods"],
    imageHue: "brown",
    variants: [
      { flavor: "Vanilla Custard Tobacco", nicotine: "10mg", size: "10ml", price: 4.99, stock: 120 },
      { flavor: "Vanilla Custard Tobacco", nicotine: "20mg", size: "10ml", price: 4.99, stock: 95 },
      { flavor: "Caramel Tobacco", nicotine: "10mg", size: "10ml", price: 4.99, stock: 73 },
      { flavor: "Caramel Tobacco", nicotine: "20mg", size: "10ml", price: 4.99, stock: 5 },
    ],
  },
  {
    name: "Nebula X Pod Kit",
    brand: "Nebula",
    category: "pod-systems",
    description: "2000mAh pod system with 5–40W adjustable output, 0.69\" OLED, 2ml refillable pods and adjustable airflow. Includes 2 pods + USB-C.",
    basePrice: 29.99,
    vgPg: "50/50",
    flavorProfile: "Menthol",
    tags: ["pod", "starter", "new"],
    imageHue: "violet",
    variants: [
      { color: "Midnight Black", price: 29.99, stock: 46 },
      { color: "Arctic Silver", price: 29.99, stock: 32 },
      { color: "Ocean Teal", price: 31.99, stock: 19 },
      { color: "Crimson Red", price: 31.99, stock: 4 },
    ],
  },
  {
    name: "Titan 200W Box Mod Kit",
    brand: "Titan",
    category: "mods-kits",
    description: "Dual-18650 200W mod with 6ml sub-ohm tank, mesh coils, 2\" TFT and full TC suite. Batteries sold separately.",
    basePrice: 59.99,
    vgPg: "70/30",
    flavorProfile: "Fruity",
    tags: ["mod", "sub-ohm", "advanced"],
    imageHue: "slate",
    variants: [
      { color: "Gunmetal", price: 59.99, stock: 22 },
      { color: "Matte Black", price: 59.99, stock: 17 },
      { color: "Rainbow", price: 64.99, stock: 9 },
    ],
  },
  {
    name: "Mesh Pro Coils 5-Pack",
    brand: "Titan",
    category: "coils-tanks",
    description: "0.15Ω mesh coils rated 60–80W. Pack of 5. Compatible with Titan Sub-Ohm Tank & Nebula XL Tank.",
    basePrice: 12.99,
    vgPg: "70/30",
    flavorProfile: "Fruity",
    tags: ["coils", "mesh"],
    imageHue: "steel",
    variants: [
      { flavor: "0.15Ω Mesh", price: 12.99, stock: 150 },
      { flavor: "0.2Ω Mesh", price: 12.99, stock: 88 },
      { flavor: "0.4Ω MTL", price: 11.99, stock: 6 },
    ],
  },
  {
    name: "Strawberry Cloud 100ml Shortfill",
    brand: "Cloud Haven",
    category: "e-liquids",
    description: "Sun-ripened strawberries with sweet cream. 70/30 shortfill, 120ml bottle with 100ml juice.",
    basePrice: 18.99,
    vgPg: "70/30",
    flavorProfile: "Fruity",
    tags: ["shortfill", "fruity"],
    imageHue: "pink",
    variants: [
      { flavor: "Strawberry Cream", nicotine: "0mg", size: "100ml", price: 18.99, stock: 64 },
      { flavor: "Strawberry Cream", nicotine: "3mg", size: "100ml", price: 21.99, stock: 48 },
      { flavor: "Kiwi Strawberry", nicotine: "0mg", size: "100ml", price: 18.99, stock: 29 },
    ],
  },
  {
    name: "Volt 3000mAh Battery + Charger Bundle",
    brand: "Volt",
    category: "accessories",
    description: "2x 18650 3000mAh cells + 2-bay smart charger with LCD. Genuine cells with safety case.",
    basePrice: 24.99,
    vgPg: "50/50",
    flavorProfile: "Drinks",
    tags: ["batteries", "charger"],
    imageHue: "green",
    variants: [{ color: "Standard", price: 24.99, stock: 70 }],
  },
  {
    name: "Cola Fizz 50ml Shortfill",
    brand: "Frostline",
    category: "e-liquids",
    description: "Classic cola with fizzy sherbet and ice. A drinks-profile all-day vape.",
    basePrice: 13.99,
    vgPg: "70/30",
    flavorProfile: "Drinks",
    tags: ["shortfill", "drinks"],
    imageHue: "cola",
    variants: [
      { flavor: "Cola Fizz Ice", nicotine: "0mg", size: "50ml", price: 13.99, stock: 51 },
      { flavor: "Cola Fizz Ice", nicotine: "3mg", size: "50ml", price: 14.99, stock: 33 },
      { flavor: "Lemonade Fizz", nicotine: "0mg", size: "50ml", price: 13.99, stock: 12 },
    ],
  },
];

export const seedPromos = [
  { code: "WELCOME10", type: "percent", value: "10", minOrder: "0", usageLimit: 1000 },
  { code: "FREESHIP", type: "fixed", value: "3.99", minOrder: "20", usageLimit: 500 },
  { code: "CLOUD20", type: "percent", value: "20", minOrder: "60", usageLimit: 200 },
];
