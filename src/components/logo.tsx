import { classNames as clsx } from '@/lib/format';

type Props = {
  /** Height in px. Width is determined by the logo's natural aspect ratio. */
  height?: number;
  className?: string;
  /**
   * Render the logo 'naked' (no white card, no rounding) so its black
   * background blends into the surrounding dark surface. Use onDark only
   * when the immediate background is pure black (#000) — otherwise the
   * PNG's black edges will show as a visible dark square. When in doubt,
   * leave onDark=false (default) which renders the logo on a white card
   * that works on any background.
   */
  onDark?: boolean;
};

/**
 * Dr Cloud brand logo — white cloud with "DR CLOUD" knocked out inside it
 * and "THE MOBILE & VAPE STORE" below, on a black square (PNG).
 *
 * Two display modes:
 *  - onDark=false (default): logo sits on a white rounded card — clean
 *    on teal strips, footers, and any non-black surface.
 *  - onDark=true: logo is rendered raw (no card) — its black background
 *    blends invisibly into a pure-black parent such as the main header.
 */
export function Logo({ height = 48, className, onDark = false }: Props) {
  if (onDark) {
    return (
      <div className={clsx('flex items-center justify-center', className)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/images/dr-cloud-logo.png"
          alt="Dr Cloud"
          style={{ height, width: 'auto', display: 'block' }}
        />
      </div>
    );
  }
  return (
    <div className={clsx('flex items-center justify-center', className)}>
      <span
        className="inline-flex items-center justify-center rounded-2xl bg-white p-1 shadow-md"
        style={{ height, padding: Math.round(height * 0.06) }}
        aria-label="Dr Cloud"
        role="img"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/images/dr-cloud-logo.png"
          alt="Dr Cloud"
          style={{ height: height - Math.round(height * 0.12), width: 'auto', display: 'block' }}
        />
      </span>
    </div>
  );
}
