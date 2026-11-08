export const gbp = (n: number | string) => {
  const v = typeof n === "string" ? parseFloat(n) : n;
  return `£${(isNaN(v) ? 0 : v).toFixed(2)}`;
};

export function variantLabel(v: {
  flavor?: string | null;
  nicotineStrength?: string | null;
  bottleSize?: string | null;
  color?: string | null;
}) {
  return [v.flavor, v.nicotineStrength, v.bottleSize, v.color].filter(Boolean).join(" · ");
}

export function isAdult(dob: string): boolean {
  const d = new Date(dob);
  if (isNaN(d.getTime())) return false;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  const threshold = parseInt(process.env.NEXT_PUBLIC_AGE_THRESHOLD || "18", 10);
  return age >= threshold;
}

export const NICOTINE_STRENGTHS = ["0mg", "3mg", "6mg", "10mg", "20mg"];
export const BOTTLE_SIZES = ["10ml", "50ml", "100ml", "60ml"];
export const FLAVOR_PROFILES = [
  "Menthol",
  "Tobacco",
  "Fruity",
  "Dessert",
  "Drinks",
  "Candy",
  "Ice",
];
export const VG_PG = ["50/50", "70/30", "80/20", "60/40"];
export const ORDER_STATUSES = ["pending", "paid", "processing", "shipped", "cancelled", "refunded"] as const;
