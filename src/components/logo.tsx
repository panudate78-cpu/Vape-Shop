import { classNames as clsx } from '@/lib/format';

type Props = {
  height?: number;
  className?: string;
  onDark?: boolean;
};

/**
 * Dr Cloud logo — uses the actual file the shop owner uploaded to
 * /public/images/dr-cloud-logo.png. No generation, no SVG, no code-drawn
 * version — just the real logo image.
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
  // White rounded card for teal/light surfaces (age-gate only now; visit strip removed).
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
          src="/images/dr-cloud-logo.png"
          alt="Dr Cloud — The Mobile & Vape Store"
          style={{ height: height + pad * 2, width: 'auto', display: 'block' }}
        />
      </span>
    </div>
  );
}
