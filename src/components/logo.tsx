import { classNames as clsx } from '@/lib/format';

type Props = {
  /** Height in px. Width is automatic based on the logo's aspect ratio (~3:1). */
  height?: number;
  className?: string;
  /**
   * Render the logo 'naked' (no card, no padding) so its black background
   * blends invisibly into a pure-black parent (e.g. the main header or
   * footer). Leave false (default) when placing on non-black surfaces
   * like teal strips or light cards.
   */
  onDark?: boolean;
};

/**
 * Dr Cloud brand logo — white cloud on black with "DR CLOUD" knocked out
 * inside and "THE MOBILE & VAPE STORE" in white underneath. Source PNG is
 * 373x122 (~3:1 landscape).
 */
export function Logo({ height = 44, className, onDark = false }: Props) {
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
  // Card version: white rounded backing so the logo reads on teal/light.
  const pad = Math.max(2, Math.round(height * 0.08));
  return (
    <div className={clsx('flex items-center justify-center', className)}>
      <span
        className="inline-flex items-center justify-center rounded-xl bg-white shadow-md"
        style={{ height: height + pad * 2, padding: pad }}
        aria-label="Dr Cloud"
        role="img"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/images/dr-cloud-logo.png"
          alt="Dr Cloud"
          style={{ height, width: 'auto', display: 'block' }}
        />
      </span>
    </div>
  );
}
