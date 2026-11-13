'use client';

import { useEffect, useState } from 'react';
import { optimizedImg, fallBackToOriginal } from '@/lib/imageUrl';
import { cn } from '@/lib/cn';
import type { HardwareTier } from '@/types';

/** "Photos by setup": tabs for PS5, PC, VR and so on, each with that setup's own photos.
 *  Shows only when the café has uploaded photos for at least one setup. */
export function SetupPhotosSection({
  tiers,
  selectedTierId,
  onOpen,
}: {
  tiers: HardwareTier[];
  /** Set when a player taps "See photos" on a setup card. */
  selectedTierId?: string | null;
  onOpen: (images: string[], index: number) => void;
}) {
  const withPhotos = tiers.filter((t) => (t.photos?.length ?? 0) > 0);
  const [activeId, setActiveId] = useState<string | null>(withPhotos[0]?.id ?? null);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (selectedTierId && withPhotos.some((t) => t.id === selectedTierId)) {
      setActiveId(selectedTierId);
      setIndex(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTierId]);

  if (withPhotos.length === 0) return null;
  const active = withPhotos.find((t) => t.id === activeId) ?? withPhotos[0];
  const photos = active.photos ?? [];
  const at = Math.min(index, photos.length - 1);
  const current = photos[at];

  return (
    <section id="setup-photos" className="flex scroll-mt-4 flex-col gap-3" aria-labelledby="setup-photos-h">
      <div className="flex flex-col gap-0.5">
        <h2 id="setup-photos-h" className="font-heading text-h2 text-text-primary">Photos by setup</h2>
        <p className="text-caption text-text-secondary">See what you will play on before you book.</p>
      </div>
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Photos by setup">
        {withPhotos.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={t.id === active.id}
            onClick={() => { setActiveId(t.id); setIndex(0); }}
            className={cn(
              'min-h-[44px] flex-shrink-0 rounded-full border px-4 text-caption font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
              t.id === active.id ? 'border-primary bg-primary text-white' : 'border-border bg-card text-text-primary hover:border-primary/60',
            )}
          >
            {t.name}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={() => onOpen(photos, at)}
        aria-label={`Open ${active.name} photo full screen`}
        className="relative aspect-[16/10] w-full overflow-hidden rounded-2xl bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img {...optimizedImg(current, '(min-width: 896px) 448px, 100vw', { maxWidth: 1000 })} onError={fallBackToOriginal(current)} alt={`${active.name} photo`} className="h-full w-full object-cover" loading="lazy" decoding="async" />
        <span className="absolute bottom-2 left-2 rounded-lg bg-black/65 px-2.5 py-1 text-caption font-semibold text-white">{active.name}</span>
        {photos.length > 1 && (
          <span className="absolute bottom-2 right-2 rounded-lg bg-black/65 px-2.5 py-1 text-caption font-semibold text-white">{at + 1} / {photos.length}</span>
        )}
      </button>
      {photos.length > 1 && (
        <div className="flex gap-2 overflow-x-auto">
          {photos.map((p, i) => (
            <button
              key={p + i}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`Photo ${i + 1} of ${active.name}`}
              aria-current={i === at}
              className={cn('h-[60px] w-[84px] flex-shrink-0 overflow-hidden rounded-xl border-2 bg-surface', i === at ? 'border-primary' : 'border-transparent')}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img {...optimizedImg(p, '84px', { maxWidth: 240 })} onError={fallBackToOriginal(p)} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
