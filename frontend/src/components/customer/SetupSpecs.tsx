'use client';

import { useId, useState } from 'react';
import { ChevronDown, Images } from 'lucide-react';
import type { HardwareTier } from '@/types';

export interface SpecItem {
  label: string;
  value: string;
}

/**
 * What a PC is, in the order players ask: CPU, GPU, screen, refresh rate, then RAM. Only fields that exist;
 * a missing one is skipped, never shown as "N/A".
 */
export function pcSpecItems(tier: Pick<HardwareTier, 'specs' | 'refreshRateHz'>): SpecItem[] {
  const s = tier.specs ?? {};
  const items: SpecItem[] = [];
  if (s.cpu?.trim()) items.push({ label: 'CPU', value: s.cpu.trim() });
  if (s.gpu?.trim()) items.push({ label: 'GPU', value: s.gpu.trim() });
  if (s.monitor?.trim()) items.push({ label: 'Screen', value: s.monitor.trim() });
  if (tier.refreshRateHz) items.push({ label: 'Refresh', value: `${tier.refreshRateHz} Hz` });
  if (s.ram?.trim()) items.push({ label: 'RAM', value: s.ram.trim() });
  return items;
}

/** CPU, GPU, screen and refresh rate of a PC in one compact grid. */
export function SetupSpecGrid({ items }: { items: SpecItem[] }) {
  if (items.length === 0) return null;
  return (
    <dl className={`mt-1 grid gap-x-3 gap-y-0.5 text-caption ${items.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
      {items.map((it) => (
        <div key={it.label} className="flex min-w-0 gap-1.5">
          <dt className="flex-none text-text-secondary">{it.label}</dt>
          <dd className="min-w-0 font-semibold text-text-primary [overflow-wrap:anywhere]">{it.value}</dd>
        </div>
      ))}
    </dl>
  );
}

interface FpsRow {
  key: string;
  game: string;
  fps: number;
  estimated?: boolean;
}

/**
 * One quiet line under a setup: "Game FPS" with a chevron (opens the figures in place) and, on the right,
 * "N photos". Both sit above the tile's stretched booking button (relative z-10), so neither starts a booking.
 */
export function SetupExtras({ fps, photoCount, onPhotos }: { fps: FpsRow[]; photoCount: number; onPhotos: () => void }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  if (fps.length === 0 && photoCount === 0) return null;
  const link =
    'inline-flex min-h-[32px] items-center gap-1 text-caption font-semibold text-primary-dark hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary';
  return (
    <div className="relative z-10 mt-1">
      <div className="flex items-center justify-between gap-3">
        {fps.length > 0 ? (
          <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls={panelId} className={link}>
            Game FPS
            <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} aria-hidden />
          </button>
        ) : (
          <span />
        )}
        {photoCount > 0 && (
          <button type="button" onClick={onPhotos} className={link}>
            <Images className="h-3.5 w-3.5" aria-hidden />
            {photoCount} {photoCount === 1 ? 'photo' : 'photos'}
          </button>
        )}
      </div>
      {fps.length > 0 && (
        <div id={panelId} hidden={!open} className="pb-0.5 pt-0.5 text-caption text-text-secondary">
          <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
            {fps.map((g) => (
              <span key={g.key} className="whitespace-nowrap">
                {g.game}{' '}
                <span className="font-data font-semibold text-text-primary">
                  {g.estimated ? '~' : ''}
                  {g.fps} FPS
                </span>
              </span>
            ))}
          </p>
          {fps.some((g) => g.estimated) && <p className="mt-0.5 text-[11px] text-text-tertiary">~ is an estimate from the graphics card.</p>}
        </div>
      )}
    </div>
  );
}
