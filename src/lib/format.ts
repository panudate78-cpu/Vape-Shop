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
