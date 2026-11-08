import { classNames as clsx } from '@/lib/format';

type Props = {
  /** Height of the visible logo area in px. */
  height?: number;
  className?: string;
  /** Render 'naked' on pure-black surfaces (header/footer) so no card is drawn. */
  onDark?: boolean;
};

/**
 * Dr Cloud brand mark. Hand-drawn SVG matching the shop's actual logo:
 *  - white 5-lobe cartoon cloud
 *  - "DR CLOUD" in black bold caps, with an oversized raised ring 'O'
 *  - "THE MOBILE & VAPE STORE" in smaller black caps inside the cloud
 *  - pure-black background that blends into dark surfaces
 */
export function Logo({ height = 60, className, onDark = false }: Props) {
  const img = (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/images/dr-cloud-logo.svg"
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
  const pad = Math.max(4, Math.round(height * 0.12));
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
          src="/images/dr-cloud-logo.svg"
          alt="Dr Cloud — The Mobile & Vape Store"
          style={{ height: height + pad * 2, width: 'auto', display: 'block' }}
        />
      </span>
    </div>
  );
}
