import { classNames as clsx } from '@/lib/format';

type Props = {
  /** Height of the visible logo area in px. */
  height?: number;
  className?: string;
  /** Render 'naked' on pure-black surfaces (header/footer) so no card is drawn. */
  onDark?: boolean;
};

/**
 * Dr Cloud brand logo — white cloud with "DR CLOUD" knocked out in black
 * and "THE MOBILE & VAPE STORE" in white underneath, on a black field.
 *
 * The source PNG has black padding around the mark for crop flexibility.
 * We use negative inset + overflow-hidden to trim that padding so the
 * mark sits flush against the header edge with no visible black gap.
 */
export function Logo({ height = 44, className, onDark = false }: Props) {
  // After cropping, the visible cloud+text occupies roughly the middle 65% of
  // the source image height (top/bottom have black padding). Trim via CSS so
  // we don't need image-processing tooling at build time.
  const trim = Math.round(height * 0.18);
  const outerStyle = { height, overflow: 'hidden' as const };
  const imgStyle = {
    height: height + trim * 2,
    width: 'auto' as const,
    display: 'block' as const,
    marginTop: -trim,
    marginBottom: -trim,
  };

  if (onDark) {
    return (
      <div className={clsx('flex items-center justify-center', className)} style={outerStyle}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/dr-cloud-logo.png" alt="Dr Cloud" style={imgStyle} />
      </div>
    );
  }
  const pad = Math.max(2, Math.round(height * 0.08));
  return (
    <div className={clsx('flex items-center justify-center', className)}>
      <span
        className="inline-flex items-center justify-center rounded-xl bg-white shadow-md"
        style={{ height: height + pad * 2, padding: pad, overflow: 'hidden' }}
        aria-label="Dr Cloud"
        role="img"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/images/dr-cloud-logo.png"
          alt="Dr Cloud"
          style={{ height: height + pad * 2 + trim * 2, width: 'auto', display: 'block', marginTop: -trim, marginBottom: -trim }}
        />
      </span>
    </div>
  );
}
