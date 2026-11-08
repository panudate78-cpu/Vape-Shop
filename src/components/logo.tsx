import { classNames as clsx } from '@/lib/format';

type Props = {
  height?: number;
  className?: string;
  /** Render on a pure-black surface (only used where a parent is explicitly solid black;
   *  by default we render the logo on a white card which works on the new light theme). */
  onDark?: boolean;
};

/**
 * Dr Cloud logo.
 * - Default (onDark=false): renders the black-background logo on a crisp white
 *   rounded card with a subtle border/shadow — perfect for the new light/white theme.
 * - onDark=true: renders the logo naked (no card) — use on explicitly black
 *   parents only (none in the light theme, but kept for footer accents if needed).
 */
export function Logo({ height = 60, className, onDark = false }: Props) {
  const img = (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/images/dr-cloud-logo.png"
      alt="Dr Cloud — The Mobile & Vape Store"
      style={{ height, width: 'auto', display: 'block' }}
    />
  );

  if (onDark) {
    return (
      <div className={clsx('flex items-center justify-center', className)} aria-label="Dr Cloud">
        {img}
      </div>
    );
  }

  // White card — the logo's own black background becomes the "badge" inside
  // the card, with clean white padding around it.
  const pad = Math.max(4, Math.round(height * 0.14));
  return (
    <div className={clsx('flex items-center justify-center', className)}>
      <span
        className="inline-flex items-center justify-center rounded-xl bg-white border border-slate-200 shadow-sm"
        style={{ height: height + pad * 2, padding: pad }}
        aria-label="Dr Cloud"
        role="img"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/images/dr-cloud-logo.png"
          alt="Dr Cloud — The Mobile & Vape Store"
          style={{ height: height, width: 'auto', display: 'block' }}
        />
      </span>
    </div>
  );
}
