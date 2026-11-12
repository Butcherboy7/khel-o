'use client';

import { Armchair, Monitor } from 'lucide-react';
import { NumericField } from '@/components/ui';
import { InfoTip } from '@/components/shared/InfoTip';
import { cn } from '@/lib/cn';
import type { TierConfig } from '@/types';

/** Same keys and names as app/core/fps_estimate.py. */
export const FPS_GAMES = [
  { key: 'valorant', name: 'Valorant' },
  { key: 'cs2', name: 'CS2' },
  { key: 'fortnite', name: 'Fortnite' },
  { key: 'gta5', name: 'GTA V' },
  { key: 'cyberpunk', name: 'Cyberpunk 2077' },
] as const;

const HZ_CHOICES = [60, 75, 120, 144, 165, 180, 240, 360];

/** Cabin defaults an owner can change straight away. */
const DEFAULT_CABIN_FEE = 300;
const DEFAULT_PC_PRICE = 150;
const DEFAULT_CABIN_PCS = 5;

/** What the owner sees as two plain numbers is stored as the co-op fields:
 *  pricePerHour = cabin fee + one PC, coopExtraPlayerPrice = one more PC. */
export function cabinFee(config: Pick<TierConfig, 'pricePerHour' | 'coopExtraPlayerPrice'>): number {
  return Math.max(0, (config.pricePerHour || 0) - (config.coopExtraPlayerPrice || 0));
}

/** Patch for switching a PC setup between "per PC" and "cabin". */
export function chargeModePatch(config: TierConfig, room: boolean): Partial<TierConfig> {
  if (room === Boolean(config.isRoom)) return {};
  if (room) {
    const pc = config.pricePerHour > 0 ? config.pricePerHour : DEFAULT_PC_PRICE;
    return {
      isRoom: true,
      coopEnabled: true,
      coopMaxPlayers: DEFAULT_CABIN_PCS,
      coopExtraPlayerPrice: pc,
      pricePerHour: DEFAULT_CABIN_FEE + pc,
    };
  }
  return {
    isRoom: false,
    coopEnabled: false,
    // Back to one price per PC: keep the per-PC price they already had.
    pricePerHour: config.coopExtraPlayerPrice || DEFAULT_PC_PRICE,
    coopExtraPlayerPrice: 0,
    coopMaxPlayers: 2,
  };
}

/** "How do you charge?" for a PC setup, plus the cabin's own price fields. */
export function PcChargeChoice({ config, onChange }: { config: TierConfig; onChange: (patch: Partial<TierConfig>) => void }) {
  const room = Boolean(config.isRoom);
  const pcPrice = config.coopExtraPlayerPrice || 0;
  const fee = cabinFee(config);
  const pcs = config.coopMaxPlayers ?? DEFAULT_CABIN_PCS;
  const sample = [1, 2, pcs].filter((n, i, a) => n <= pcs && a.indexOf(n) === i);

  return (
    <div className="flex flex-col gap-3 sm:col-span-2">
      <div>
        <span className="mb-1.5 block text-overline font-semibold text-text-secondary">How do you charge?</span>
        <div role="radiogroup" aria-label="How do you charge for these PCs" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {([
            { room: false, icon: Monitor, title: 'Per PC', sub: 'One price per hour for each PC, wherever it sits' },
            { room: true, icon: Armchair, title: 'Private cabin', sub: 'A cabin fee, plus a price for each PC used inside' },
          ] as const).map((o) => {
            const on = o.room === room;
            return (
              <button
                key={o.title}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => onChange(chargeModePatch(config, o.room))}
                className={cn(
                  'flex items-start gap-2.5 rounded-xl border-[1.5px] px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                  on ? 'border-primary bg-primary/[0.06]' : 'border-border bg-card hover:border-text-secondary/40',
                )}
              >
                <o.icon className={cn('mt-0.5 h-5 w-5 flex-shrink-0', on ? 'text-primary' : 'text-text-secondary')} aria-hidden />
                <span className="min-w-0">
                  <span className={cn('block font-heading text-body font-bold', on ? 'text-primary-dark' : 'text-text-primary')}>{o.title}</span>
                  <span className="block text-caption text-text-secondary">{o.sub}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {room && (
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <NumericField
              label="Cabin fee (₹ per hour)"
              min={0}
              value={fee}
              onChange={(n) => onChange({ pricePerHour: n + pcPrice })}
            />
            <NumericField
              label="Each PC inside (₹ per hour)"
              min={1}
              value={pcPrice}
              onChange={(n) => onChange({ coopExtraPlayerPrice: n, pricePerHour: fee + n })}
            />
            <NumericField
              label="PCs in one cabin"
              min={2}
              max={8}
              value={pcs}
              onChange={(n) => onChange({ coopMaxPlayers: n })}
            />
          </div>
          <p className="rounded-lg bg-surface px-3 py-2 text-caption text-text-secondary" aria-live="polite">
            The cabin is booked by one group, whether they use 1 PC or all {pcs}. For one hour:{' '}
            {sample.map((n, i) => (
              <span key={n}>
                {i > 0 && ' · '}
                {n} {n === 1 ? 'PC' : 'PCs'}{' '}
                <b className="font-semibold text-text-primary">₹{fee + pcPrice * n}</b>
              </span>
            ))}
            . Shorter bookings cost the same share of that.
          </p>
          <p className="text-caption text-text-secondary">
            Set “Total units” to how many cabins you have. Normal hall PCs are a separate setup priced per PC.
          </p>
        </div>
      )}
    </div>
  );
}

/** Refresh rate first, then optional FPS: what esports players check before booking. */
export function PcSpeedFields({ config, onChange }: { config: TierConfig; onChange: (patch: Partial<TierConfig>) => void }) {
  const hz = config.refreshRateHz ?? null;
  const overrides = config.fpsOverrides ?? {};
  const estimates = new Map((config.expectedFps ?? []).filter((g) => g.estimated).map((g) => [g.key, g.fps]));
  const setFps = (key: string, raw: string) => {
    const digits = raw.replace(/[^\d]/g, '').replace(/^0+/, '');
    const next = { ...overrides };
    if (digits === '') delete next[key];
    else next[key] = Math.min(1000, Number(digits));
    onChange({ fpsOverrides: next });
  };

  return (
    <div className="flex flex-col gap-3 sm:col-span-2">
      <div>
        <span className="mb-1.5 flex items-center gap-0.5 text-overline font-semibold text-text-secondary">
          Screen refresh rate
          <InfoTip
            text="How many times per second the monitor updates. Esports players look at this first: 144 Hz or 240 Hz feels much smoother than 60 Hz. Players see it on your café page."
            label="About refresh rate"
          />
        </span>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Screen refresh rate">
          {HZ_CHOICES.map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={hz === n}
              onClick={() => onChange({ refreshRateHz: hz === n ? null : n })}
              className={cn(
                'h-9 rounded-full border px-3.5 text-caption font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                hz === n ? 'border-primary bg-primary text-white' : 'border-border bg-surface text-text-secondary hover:border-primary/60',
              )}
            >
              {n} Hz
            </button>
          ))}
        </div>
        <p className="mt-1 text-caption text-text-secondary">Not sure? Leave it empty. Tap again to clear.</p>
      </div>

      <details className="rounded-xl border border-border bg-card">
        <summary className="flex min-h-[44px] cursor-pointer items-center px-3 text-body font-semibold text-text-primary">
          Game speed (FPS) players will see
        </summary>
        <div className="flex flex-col gap-2 border-t border-border p-3">
          <p className="text-caption text-text-secondary">
            Players see an estimate worked out from your graphics card, marked “estimated”. If you have tested a game on these
            PCs, type the real number and it replaces the estimate.
          </p>
          <div className="grid grid-cols-1 gap-2">
            {FPS_GAMES.map((g) => (
              <label key={g.key} className="flex items-center justify-between gap-3 rounded-lg bg-surface px-3 py-2">
                <span className="text-caption font-semibold text-text-primary">{g.name}</span>
                <span className="inline-flex items-center gap-1">
                  <input
                    type="text"
                    inputMode="numeric"
                    aria-label={`${g.name} FPS`}
                    placeholder={estimates.has(g.key) ? `~${estimates.get(g.key)}` : 'FPS'}
                    value={overrides[g.key] ?? ''}
                    onChange={(e) => setFps(g.key, e.target.value)}
                    className="h-9 w-20 rounded-lg border border-border bg-card px-2 text-right font-data text-body placeholder:text-text-secondary/70 focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                  <span className="text-caption text-text-secondary">FPS</span>
                </span>
              </label>
            ))}
          </div>
        </div>
      </details>
    </div>
  );
}
