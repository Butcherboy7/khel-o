'use client';

import { useCallback, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { optimizedImg, fallBackToOriginal } from '@/lib/imageUrl';

export interface CarouselPhoto {
  url: string;
  /** The photo's main colour, painted behind it while it loads. */
  color?: string | null;
}

/** Which dots to draw: all of them up to `max`, otherwise a window that follows the current photo. */
export function visibleDots(total: number, current: number, max = 7): number[] {
  if (total <= max) return Array.from({ length: total }, (_, i) => i);
  const half = Math.floor(max / 2);
  const start = Math.min(Math.max(current - half, 0), total - max);
  return Array.from({ length: max }, (_, i) => start + i);
}

const ARROW =
  'absolute top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white opacity-80 backdrop-blur-md transition-opacity hover:bg-black/60 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white md:h-10 md:w-10 md:opacity-0 md:group-hover:opacity-100';

/**
 * The café's photos as a thumb-swipeable strip (native scroll-snap), with Instagram-style dots under it and
 * arrows for mouse users. Tapping a photo calls onOpen. The parent owns which photo is current.
 */
export function PhotoCarousel({
  photos,
  alt,
  index,
  onIndexChange,
  onOpen,
  sizes,
}: {
  photos: CarouselPhoto[];
  alt: string;
  index: number;
  onIndexChange: (i: number) => void;
  onOpen: (i: number) => void;
  sizes: string;
}) {
  const track = useRef<HTMLDivElement>(null);
  const raf = useRef(0);
  const n = photos.length;
  const at = n ? ((index % n) + n) % n : 0;

  // A thumb or trackpad scrolled the strip: tell the parent which photo is now centred.
  const onScroll = useCallback(() => {
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => {
      const el = track.current;
      if (!el || !el.clientWidth) return;
      const i = Math.round(el.scrollLeft / el.clientWidth);
      if (i !== at) onIndexChange(i);
    });
  }, [at, onIndexChange]);

  // An arrow or dot changed the index: slide to it. After a swipe the strip is already there, so this does nothing.
  useEffect(() => {
    const el = track.current;
    if (!el || !el.clientWidth) return;
    if (Math.round(el.scrollLeft / el.clientWidth) !== at) el.scrollTo({ left: at * el.clientWidth, behavior: 'smooth' });
  }, [at]);

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  if (n === 0) return null;
  const go = (i: number) => onIndexChange((i + n) % n);

  return (
    <>
      <div
        ref={track}
        onScroll={onScroll}
        className="flex h-full w-full snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        role="group"
        aria-roledescription="carousel"
        aria-label={`${alt} photos`}
      >
        {photos.map((p, i) => (
          <div
            key={p.url + i}
            className="h-full w-full flex-none snap-center snap-always"
            style={p.color ? { backgroundColor: p.color } : undefined}
            role="group"
            aria-roledescription="slide"
            aria-label={`${i + 1} of ${n}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              {...optimizedImg(p.url, sizes, { maxWidth: 1920 })}
              onError={fallBackToOriginal(p.url)}
              alt={`${alt} photo ${i + 1}`}
              className="h-full w-full cursor-zoom-in select-none object-cover"
              loading={i === 0 ? 'eager' : 'lazy'}
              fetchPriority={i === 0 ? 'high' : 'auto'}
              decoding="async"
              draggable={false}
              onClick={() => onOpen(i)}
            />
          </div>
        ))}
      </div>

      {n > 1 && (
        <>
          <button type="button" onClick={() => go(at - 1)} aria-label="Previous photo" className={`${ARROW} left-3`}>
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button type="button" onClick={() => go(at + 1)} aria-label="Next photo" className={`${ARROW} right-3`}>
            <ChevronRight className="h-5 w-5" />
          </button>
          <Dots total={n} current={at} onPick={go} className="absolute inset-x-0 bottom-3 z-10" />
        </>
      )}
    </>
  );
}

/** Instagram-style position dots: the current one is longer and solid, the rest small and soft. */
export function Dots({
  total,
  current,
  onPick,
  className = '',
}: {
  total: number;
  current: number;
  onPick: (i: number) => void;
  className?: string;
}) {
  return (
    <div className={`pointer-events-none flex justify-center ${className}`}>
      <div className="pointer-events-auto flex items-center rounded-full bg-black/30 px-1.5 backdrop-blur-sm" role="group" aria-label="Photo position">
        {visibleDots(total, current).map((i) => (
          <button
            key={i}
            type="button"
            onClick={() => onPick(i)}
            aria-label={`Photo ${i + 1} of ${total}`}
            aria-current={i === current}
            className="flex h-6 w-[14px] items-center justify-center focus-visible:outline-none"
          >
            <span className={`block h-1.5 rounded-full transition-all duration-200 ${i === current ? 'w-4 bg-white' : 'w-1.5 bg-white/55'}`} />
          </button>
        ))}
      </div>
    </div>
  );
}
