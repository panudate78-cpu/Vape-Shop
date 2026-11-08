'use client';
import { useState, type ImgHTMLAttributes } from 'react';

type Props = ImgHTMLAttributes<HTMLImageElement>;
export function PlaceholderImage({ className = '', src, alt, ...rest }: Props) {
  const [errored, setErrored] = useState(false);
  if (errored || !src) {
    return <div className={`bg-gradient-to-br from-teal-900/40 to-zinc-800 grid place-items-center text-3xl ${className}`} aria-hidden>☁️</div>;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    <img src={src} alt={alt || ''} className={className} onError={() => setErrored(true)} {...rest} />
  );
}
