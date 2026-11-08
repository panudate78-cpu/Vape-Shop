export function formatPrice(p: number | string | null | undefined) {
  const n = typeof p === 'string' ? parseFloat(p) : Number(p ?? 0);
  return `£${n.toFixed(2)}`;
}
export const gbp = formatPrice;

export function classNames(...xs: (string | false | null | undefined)[]) {
  return xs.filter(Boolean).join(' ');
}
export function variantLabel(v: { flavor?: string | null; nicotineStrength?: string | null; bottleSize?: string | null; color?: string | null }) {
  return [v.flavor, v.nicotineStrength, v.bottleSize, v.color].filter(Boolean).join(' · ') || 'Standard';
}
export function randomOrderRef() {
  return 'DRC-' + Date.now().toString(36).toUpperCase() + Math.floor(Math.random() * 1000).toString().padStart(3, '0');
}

// Shared option lists used by product editor / admin screens
export const NICOTINE_STRENGTHS = ['0mg', '3mg', '6mg', '10mg', '12mg', '18mg', '20mg'] as const;
export const BOTTLE_SIZES = ['2ml', '10ml', '50ml', '100ml', '600 puffs', '1 kit', '5-pack', 'pair'] as const;
export const VG_PG = ['50/50', '60/40', '70/30', '80/20', 'Max VG', '—'] as const;
export const FLAVOR_PROFILES = ['Fruity', 'Menthol/Ice', 'Dessert', 'Tobacco', 'Candy', 'Drink', 'Bakery', 'Nuts/Cream', '—'] as const;
