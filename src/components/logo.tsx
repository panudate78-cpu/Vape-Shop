import { classNames as clsx } from '@/lib/format';

type Props = {
  height?: number;
  className?: string;
  onDark?: boolean;
};

/**
 * Dr Cloud brand mark — inline SVG so it always renders (no external file fetch).
 * Matches the real shop logo:
 *   - white 5-lobe cartoon cloud
 *   - "DR CLOUD" in bold black caps, with an oversized raised ring 'O'
 *   - "THE MOBILE & VAPE STORE" in smaller spaced black caps inside the cloud
 *   - transparent background so it blends into any surface
 */
function CloudMark() {
  return (
    <svg
      viewBox="0 0 1000 520"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Dr Cloud — The Mobile & Vape Store"
      style={{ display: 'block', height: '100%', width: 'auto' }}
    >
      {/* White cloud body (5 lobes from overlapping circles) */}
      <g fill="#fff">
        <rect x="60" y="180" width="880" height="260" rx="130" ry="130" />
        <circle cx="180" cy="300" r="130" />
        <circle cx="820" cy="300" r="130" />
        <circle cx="330" cy="195" r="120" />
        <circle cx="500" cy="170" r="145" />
        <circle cx="670" cy="195" r="120" />
        <circle cx="370" cy="410" r="105" />
        <circle cx="630" cy="410" r="105" />
        <rect x="180" y="180" width="640" height="230" />
      </g>

      {/* "DR CLOUD" with the big stylised raised ring O */}
      <g fill="#000" fontFamily="Arial Black, Helvetica Neue Bold, sans-serif" fontWeight={900}>
        <text x="170" y="330" fontSize="170" textAnchor="middle">D</text>
        <text x="295" y="330" fontSize="170" textAnchor="middle">R</text>
        <text x="420" y="330" fontSize="170" textAnchor="middle">C</text>
        <text x="520" y="330" fontSize="170" textAnchor="middle">L</text>
        <circle cx="600" cy="275" r="82" />
        <circle cx="600" cy="275" r="40" fill="#fff" />
        <text x="720" y="330" fontSize="170" textAnchor="middle">U</text>
        <text x="845" y="330" fontSize="170" textAnchor="middle">D</text>
      </g>

      {/* Tagline inside the cloud */}
      <text
        x="500"
        y="400"
        fill="#000"
        fontFamily="Arial, Helvetica, sans-serif"
        fontWeight={500}
        fontSize="42"
        letterSpacing="8"
        textAnchor="middle"
      >
        THE MOBILE &amp; VAPE STORE
      </text>
    </svg>
  );
}

export function Logo({ height = 60, className, onDark = false }: Props) {
  // onDark: transparent bg, sits directly on black header/footer.
  if (onDark) {
    return (
      <div
        className={clsx('flex items-center justify-center', className)}
        style={{ height, background: 'transparent' }}
      >
        <div style={{ height, width: 'auto', position: 'relative' }}>
          <CloudMark />
        </div>
      </div>
    );
  }
  // White rounded card for teal/light surfaces (age-gate, etc.).
  const pad = Math.max(4, Math.round(height * 0.12));
  return (
    <div className={clsx('flex items-center justify-center', className)}>
      <span
        className="inline-flex items-center justify-center rounded-xl bg-white shadow-md"
        style={{ height: height + pad * 2, padding: pad }}
      >
        <div style={{ height: height + pad * 2, width: 'auto' }}>
          <CloudMark />
        </div>
      </span>
    </div>
  );
}
