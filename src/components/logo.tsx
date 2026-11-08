import { classNames as clsx } from '@/lib/format';

type Props = {
  size?: number;        // square size in px
  className?: string;
  showWord?: boolean;   // DEPRECATED — no longer rendered; kept for backwards compat
};

/**
 * Dr Cloud shop-sign logo.
 *
 * The source photo is the real shop fascia sign. The photo itself already says
 * "DR CLOUD" inside the cloud engraving, so we render just the sign image on a
 * soft white rounded card — no separate "Dr Cloud" text next to it.
 */
export function Logo({ size = 56, className }: Props) {
  return (
    <div className={clsx('flex items-center justify-center', className)}>
      <span
        className="inline-flex items-center justify-center rounded-2xl bg-white shadow-md"
        style={{ width: size, height: size }}
        aria-label="Dr Cloud"
        role="img"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/images/dr-cloud-logo.jpg"
          alt="Dr Cloud"
          width={size}
          height={size}
          className="h-full w-full object-cover rounded-2xl"
        />
      </span>
    </div>
  );
}
