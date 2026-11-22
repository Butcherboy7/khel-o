'use client';

import { useEffect, useRef, useState } from 'react';
import type { TeamChallengeConfig } from '@/challenges/types';

/**
 * The café, live, behind the hero.
 * - The poster (a frame of the clip) is the first paint and the LCP image.
 * - Phones: once the page is ready, the muted XQZ clip loops over it.
 * - Wider screens: the XQZ photos cross-fade every 6 s with a slow zoom.
 * - Reduced motion or data saver: one still photo, nothing moves.
 * - If an image fails, the brand-dark background still carries the text.
 * Decorative only (aria-hidden); readable text sits on a dark gradient.
 */
export function LiveBackdrop({ cfg }: { cfg: TeamChallengeConfig }) {
  const [mode, setMode] = useState<'still' | 'video' | 'photos'>('still');
  const [idx, setIdx] = useState(0);
  const [videoReady, setVideoReady] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const photos = cfg.media.photos;

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
    if (reduce || saveData) return;
    const start = () => setMode(window.matchMedia('(min-width: 768px)').matches ? 'photos' : 'video');
    // After the page has painted and is usable: the LCP stays the still image.
    if (document.readyState === 'complete') {
      const t = window.setTimeout(start, 350);
      return () => window.clearTimeout(t);
    }
    window.addEventListener('load', start, { once: true });
    return () => window.removeEventListener('load', start);
  }, []);

  useEffect(() => {
    if (mode !== 'photos') return;
    const t = window.setInterval(() => {
      if (document.visibilityState === 'visible') setIdx((i) => (i + 1) % photos.length);
    }, 6000);
    return () => window.clearInterval(t);
  }, [mode, photos.length]);

  // Pause the clip when the tab is hidden (battery), play again when back.
  useEffect(() => {
    if (mode !== 'video') return;
    const v = videoRef.current;
    if (!v) return;
    const onVis = () => (document.hidden ? v.pause() : v.play().catch(() => undefined));
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [mode]);

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden bg-[#0A0809]" aria-hidden>
      {/* Still: the clip's first frame on phones, the hall photo on wide screens. */}
      <picture>
        <source media="(min-width: 768px)" srcSet={photos[0].src} />
        <img
          src={cfg.media.heroPoster}
          alt=""
          fetchPriority="high"
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover"
          onError={(e) => ((e.currentTarget.style.display = 'none'))}
        />
      </picture>

      {mode === 'video' && (
        <video
          ref={videoRef}
          src={cfg.media.heroVideo}
          poster={cfg.media.heroPoster}
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          onCanPlay={() => setVideoReady(true)}
          className={`vx-fade absolute inset-0 h-full w-full object-cover ${videoReady ? 'opacity-100' : 'opacity-0'}`}
        />
      )}

      {mode === 'photos' &&
        photos.map((p, i) => (
          <img
            key={p.src}
            src={p.src}
            alt=""
            loading="lazy"
            decoding="async"
            className={`vx-fade absolute inset-0 h-full w-full object-cover ${i === idx ? 'vx-kb opacity-100' : 'opacity-0'}`}
            // Restart the zoom each time a photo comes back round.
            style={i === idx ? { animationName: 'vx-kb' } : { animationName: 'none' }}
          />
        ))}

      {/* Readability: dark top-to-bottom (≈40% → 75%), a warm brand tint, a vignette and a little grain. */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/45 via-black/45 to-[#0A0809] md:from-black/60 md:via-black/55" />
      {/* Wide screens: the text sits on the left, so the left is darkest. */}
      <div className="absolute inset-0 hidden bg-[linear-gradient(90deg,rgba(10,8,9,0.88)_0%,rgba(10,8,9,0.55)_45%,rgba(10,8,9,0.1)_80%)] md:block" />
      <div className="absolute inset-0 bg-[radial-gradient(120%_80%_at_20%_100%,rgba(208,70,60,0.28),transparent_60%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(90%_70%_at_50%_40%,transparent_40%,rgba(0,0,0,0.55)_100%)]" />
      <div className="vx-grain absolute inset-0" />
    </div>
  );
}
