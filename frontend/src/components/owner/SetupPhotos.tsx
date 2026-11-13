'use client';

import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ImagePlus, X } from 'lucide-react';
import { Button } from '@/components/ui';
import { uploadSetupPhoto } from '@/lib/api/settings';
import { updateTier } from '@/lib/api/tiers';

const MAX_PHOTOS = 8;

/** Photos of one setup (PS5s, PCs, the VR corner...). Players see them under
 *  "Photos by setup" on the café page. Saves as soon as a photo is added or removed. */
export function SetupPhotos({ cafeId, tierId, photos }: { cafeId: string; tierId: string; photos: string[] }) {
  const queryClient = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async (next: string[]) => {
    await updateTier(cafeId, tierId, { photos: next });
    queryClient.invalidateQueries({ queryKey: ['owner-hardware-tiers'] });
  };

  const add = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setErr(null);
    setBusy(true);
    try {
      let next = [...photos];
      for (const file of Array.from(files)) {
        if (next.length >= MAX_PHOTOS) break;
        next = [...next, await uploadSetupPhoto(cafeId, file)];
      }
      await save(next);
    } catch (e) {
      setErr((e as Error)?.message || 'Couldn’t add the photo. Please try again.');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  const remove = async (url: string) => {
    setErr(null);
    setBusy(true);
    try {
      await save(photos.filter((p) => p !== url));
    } catch (e) {
      setErr((e as Error)?.message || 'Couldn’t remove the photo. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-2 flex flex-col gap-2" data-tour="tier-photos">
      <p className="text-caption text-text-secondary">
        Show players what they will play on. These appear under “Photos by setup” on your café page. Up to {MAX_PHOTOS} photos.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {photos.map((url, i) => (
          <div key={url} className="relative h-16 w-16 overflow-hidden rounded-xl bg-surface">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt={`Photo ${i + 1} of this setup`} className="h-full w-full object-cover" />
            <button
              type="button"
              onClick={() => remove(url)}
              disabled={busy}
              aria-label={`Remove photo ${i + 1}`}
              className="absolute right-0.5 top-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
        ))}
        {photos.length < MAX_PHOTOS && (
          <>
            <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" id={`setup-photo-${tierId}`} onChange={(e) => add(e.target.files)} />
            <Button type="button" variant="secondary" size="sm" isLoading={busy} onClick={() => input.current?.click()} className="gap-1.5">
              <ImagePlus className="h-4 w-4" aria-hidden />
              Add photos
            </Button>
          </>
        )}
      </div>
      {err && <p role="alert" className="text-caption font-medium text-error">{err}</p>}
    </div>
  );
}
