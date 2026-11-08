import { classNames as clsx } from '@/lib/format';

type Props = {
  height?: number;
  className?: string;
  /** Render on a pure-black surface (kept for any black-surface usage; default is plain image). */
  onDark?: boolean;
};

/**
 * Dr Cloud logo. Renders the real uploaded PNG natively — no wrapping card, border or shadow.
 * The PNG already has a black background and rounded white cloud artwork, so it sits cleanly
 * on the white header without extra padding.
 */
export function Logo({ height = 76, className }: Props) {
  return (
    <div className={clsx('flex items-center justify-center', className)} aria-label="Dr Cloud">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/images/dr-cloud-logo.png"
        alt="Dr Cloud — The Mobile & Vape Store"
        style={{ height, width: 'auto', display: 'block', borderRadius: 12 }}
      />
    </div>
  );
}
