import { classNames as clsx } from '@/lib/format';

type Props = {
  /** Visual height of the logo card in px. Width scales automatically to
   *  preserve the sign's landscape aspect ratio. */
  height?: number;
  className?: string;
};

/**
 * Dr Cloud shop-sign logo.
 *
 * The source photo is a wide landscape shop fascia (white 3-lobe cloud with
 * "DR CLOUD" engraved against a muted blue-grey plate), so the card is
 * landscape — never square. We render it on a soft white rounded card with
 * a tiny bit of padding; the photo fills the card with object-contain so no
 * part of the sign gets cropped.
 */
export function Logo({ height = 44, className }: Props) {
  // The shop sign is roughly 3:1 landscape.
  const width = Math.round(height * 3);
  return (
    <div className={clsx('flex items-center justify-center', className)}>
      <span
        className="inline-flex items-center justify-center rounded-2xl bg-white p-1 shadow-md"
        style={{ width, height }}
        aria-label="Dr Cloud"
        role="img"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/images/dr-cloud-logo.jpg"
          alt="Dr Cloud"
          width={width - 8}
          height={height - 8}
          className="h-full w-full object-contain rounded-xl"
        />
      </span>
    </div>
  );
}
