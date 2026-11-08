import { classNames as clsx } from '@/lib/format';

type Props = {
  /** Visual height of the logo card in px. Width scales to match the logo's
   *  natural aspect ratio (the Dr Cloud cloud is near-square). */
  height?: number;
  className?: string;
  /** Optional "glow" accent (teal halo) used on dark hero sections. */
  glow?: boolean;
};

/**
 * Dr Cloud brand logo.
 *
 * Source: /public/images/dr-cloud-logo.png — the clean black-and-white
 * cloud mark with "DR CLOUD / THE MOBILE & VAPE STORE" inside, designed
 * for use on dark backgrounds.
 *
 * The logo is rendered on a white rounded-square card so the white cloud
 * reads against dark UI, and uses object-contain to preserve the full
 * cloud shape (no cropping).
 */
export function Logo({ height = 48, className, glow = false }: Props) {
  // The B&W logo is near-square (0.86 width/height). Add a touch of
  // horizontal breathing room so the card looks natural.
  const width = Math.round(height * 1.05);
  return (
    <div className={clsx('flex items-center justify-center', className)}>
      <span
        className={clsx(
          'inline-flex items-center justify-center rounded-2xl bg-white',
          glow && 'shadow-[0_0_30px_rgba(20,184,166,0.35)]',
        )}
        style={{ width, height, padding: Math.max(2, Math.round(height * 0.06)) }}
        aria-label="Dr Cloud"
        role="img"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/images/dr-cloud-logo.png"
          alt="Dr Cloud"
          width={width}
          height={height}
          className="h-full w-full object-contain"
        />
      </span>
    </div>
  );
}
