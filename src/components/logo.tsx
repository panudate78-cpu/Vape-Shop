import { classNames as clsx } from '@/lib/format';

type Props = {
  size?: number;        // square size in px
  className?: string;
  showWord?: boolean;   // include the "Dr Cloud" wordmark next to the mark
};

/**
 * Dr Cloud shop-sign logo.
 *
 * The source photo is the real shop fascia sign — a white 3-lobe cloud with
 * "DR CLOUD" engraved in it against a muted blue-grey sign plate. We render it
 * on a soft white rounded card so it reads cleanly on both the dark header and
 * teal visit banner without needing background removal.
 */
export function Logo({ size = 40, className, showWord = false }: Props) {
  return (
    <div className={clsx('flex items-center gap-2', className)}>
      <span
        className="inline-flex items-center justify-center rounded-xl bg-white/95 p-1 shadow-sm"
        style={{ width: size, height: size }}
        aria-hidden
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/images/dr-cloud-logo.jpg"
          alt="Dr Cloud"
          width={size - 8}
          height={size - 8}
          className="h-full w-full object-contain rounded-lg"
        />
      </span>
      {showWord && <span className="font-black text-xl tracking-tight text-white">Dr Cloud</span>}
    </div>
  );
}
