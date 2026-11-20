'use client';

import { useEffect, useState } from 'react';
import { GTA6_ART } from '@/lib/gta6Art';

/**
 * GTA 6 artwork that changes every few seconds: each image fades in and slowly pushes in. It stops when the tab is
 * hidden, and shows a still first image for people who asked for reduced motion.
 */
export function Gta6ArtRotator({ className = '', alt = 'GTA 6 artwork', images = GTA6_ART, everyMs = 5000 }: {
  className?: string;
  alt?: string;
  images?: string[];
  everyMs?: number;
}) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (images.length < 2) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') setI((n) => (n + 1) % images.length);
    }, everyMs);
    return () => window.clearInterval(id);
  }, [images.length, everyMs]);
  return (
    <div className={`relative overflow-hidden bg-[#2a0f1c] ${className}`}>
      {images.map((src, n) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={src}
          src={src}
          alt={n === 0 ? alt : ''}
          aria-hidden={n === 0 ? undefined : true}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-[1200ms] ease-in-out ${n === i ? 'opacity-100' : 'opacity-0'} ${n === i ? 'animate-gta-drift motion-reduce:animate-none' : ''}`}
          loading={n === 0 ? 'eager' : 'lazy'}
          decoding="async"
        />
      ))}
    </div>
  );
}
