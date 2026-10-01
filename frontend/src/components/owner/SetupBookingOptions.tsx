'use client';

import { Users } from 'lucide-react';
import { InfoTip } from '@/components/shared/InfoTip';
import { NumericField } from '@/components/ui';
import { cn } from '@/lib/cn';
import type { TierConfig } from '@/types';

/** Only these three are valid "shortest booking" values now — above 1 hour,
 *  every setup allows 30-minute steps regardless of this setting. Matches
 *  app/core/duration.py on the backend. */
const MIN_OPTIONS: { value: 15 | 30 | 60; label: string }[] = [
  { value: 15, label: '15 min' },
  { value: 30, label: '30 min' },
  { value: 60, label: '1 hr' },
];

const DEFAULT_OPTIONS = [15, 30, 60, 90, 120, 180];

export const fmtDuration = (m: number) => (m < 60 ? `${m} min` : m % 60 === 0 ? `${m / 60} hr` : `${Math.floor(m / 60)} hr ${m % 60}`);
const fmt = fmtDuration;

/** Every bookable length for a setup whose shortest booking is `min` —
 *  mirrors app/core/duration.py's allowed_minutes exactly. */
export function allowedMinutes(min: 15 | 30 | 60): number[] {
  const lengths = [15, 30].filter((m) => m >= min);
  for (let m = 60; m <= 480; m += 30) lengths.push(m);
  return lengths;
}

/** Same math as backend PricingService.base_price_for_minutes — what a
 *  customer pays at a given length, given the owner's inputs so far. */
export function priceForMinutes(minutes: number, hourly: number, price15?: number | null, price30?: number | null): number {
  if (minutes === 15) return price15 ?? hourly / 4;
  if (minutes === 30) return price30 ?? hourly / 2;
  return (hourly * minutes) / 60;
}

/** New-tier defaults and the edit-modal prefill share one shape. */
type BookingOptionFields = Pick<
  TierConfig,
  'coopEnabled' | 'coopMaxPlayers' | 'coopExtraPlayerPrice' | 'minBookingMinutes' | 'defaultBookingMinutes' | 'price15m' | 'price30m'
>;

export function bookingOptionsFrom(src: BookingOptionFields | undefined) {
  return {
    coopEnabled: src?.coopEnabled ?? false,
    coopMaxPlayers: src?.coopMaxPlayers ?? 2,
    coopExtraPlayerPrice: src?.coopExtraPlayerPrice ?? 0,
    minBookingMinutes: (src?.minBookingMinutes ?? 60) as 15 | 30 | 60,
    defaultBookingMinutes: src?.defaultBookingMinutes ?? null,
    price15m: src?.price15m ?? null,
    price30m: src?.price30m ?? null,
  };
}

/** What a create/update payload sends. Co-op only exists for consoles. */
export function bookingOptionsPayload(config: TierConfig) {
  const o = bookingOptionsFrom(config);
  const allowed = allowedMinutes(o.minBookingMinutes);
  const minutes = {
    minBookingMinutes: o.minBookingMinutes,
    defaultBookingMinutes: o.defaultBookingMinutes && allowed.includes(o.defaultBookingMinutes) ? o.defaultBookingMinutes : null,
    // A 15-min price only means something when 15 min is actually bookable
    // (same for 30) — clear it rather than send a stale value the backend
    // would reject once "Shortest booking" moves up past it.
    price15m: o.minBookingMinutes <= 15 ? o.price15m : null,
    price30m: o.minBookingMinutes <= 30 ? o.price30m : null,
  };
  if (config.tierType === 'activity' || config.platform === 'pc') return { ...minutes, coopEnabled: false };
  return { ...minutes, coopEnabled: o.coopEnabled, coopMaxPlayers: o.coopMaxPlayers, coopExtraPlayerPrice: o.coopExtraPlayerPrice };
}

interface Props {
  config: TierConfig;
  onChange: (patch: Partial<TierConfig>) => void;
}

/**
 * Co-op pricing (consoles only), booking-length limits, and per-length
 * pricing for one setup. Sits under "Price per hour" inside the
 * configurator card.
 */
export function SetupBookingOptions({ config, onChange }: Props) {
  const o = bookingOptionsFrom(config);
  const showCoop = config.tierType !== 'activity' && config.platform !== 'pc';
  const hourly = config.pricePerHour || 0;
  const allowed = allowedMinutes(o.minBookingMinutes);
  const previewLengths = allowed.filter((m) => m <= 120); // 15/30/1h/1h30/2h — enough to prove the ladder without a huge table
  const playerCounts = showCoop && o.coopEnabled ? Array.from({ length: o.coopMaxPlayers }, (_, i) => i + 1) : [1];
  const selectCls =
    'h-11 w-full rounded-xl border border-border bg-card px-3 text-body text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/30';

  return (
    <div className="flex flex-col gap-3 sm:col-span-2">
      {showCoop && (
        <div className="rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between gap-3 p-3">
            <div className="min-w-0">
              <span className="flex items-center gap-1 text-body font-semibold text-text-primary">
                <Users className="h-4 w-4 text-primary" aria-hidden />
                Co-op on one console
                <InfoTip
                  text="Friends share one console, a controller each, for a small extra per player. Your console count doesn't change: a co-op booking holds one unit."
                  label="What is co-op?"
                />
              </span>
              <p className="text-caption text-text-secondary">E.g. 2 friends on FC with one PS5</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={o.coopEnabled}
              aria-label="Allow co-op on one console"
              onClick={() => onChange({ coopEnabled: !o.coopEnabled })}
              className={cn(
                'relative h-7 w-12 flex-shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
                o.coopEnabled ? 'bg-primary' : 'bg-border'
              )}
            >
              <span
                className={cn(
                  'absolute left-0 top-1 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200',
                  o.coopEnabled ? 'translate-x-6' : 'translate-x-1'
                )}
              />
            </button>
          </div>

          {o.coopEnabled && (
            <div className="grid grid-cols-1 gap-3 border-t border-border p-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <span className="text-overline font-semibold text-text-secondary">Max players per console</span>
                <div className="inline-flex w-fit gap-1 rounded-xl border border-border bg-surface p-1" role="radiogroup" aria-label="Max players per console">
                  {[2, 3, 4].map((n) => (
                    <button
                      key={n}
                      type="button"
                      role="radio"
                      aria-checked={o.coopMaxPlayers === n}
                      onClick={() => onChange({ coopMaxPlayers: n })}
                      className={cn(
                        'h-9 w-11 rounded-lg text-body font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                        o.coopMaxPlayers === n ? 'bg-card text-text-primary shadow-sm' : 'text-text-secondary hover:text-text-primary'
                      )}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
              <span className="flex flex-col gap-1.5">
                <span className="flex items-center gap-0.5 text-overline font-semibold text-text-secondary">
                  Extra per friend
                  <InfoTip
                    text="Added for each extra player sharing one console. It's charged per hour, so a 30-minute co-op session adds half of this, and a 15-minute one adds a quarter."
                    label="About the co-op surcharge"
                  />
                </span>
                <NumericField label="₹ per hour" min={0} value={o.coopExtraPlayerPrice} onChange={(n) => onChange({ coopExtraPlayerPrice: n })} />
              </span>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <span className="flex flex-col gap-1.5">
          <span className="flex items-center gap-0.5 text-overline font-semibold text-text-secondary">
            Shortest booking
            <InfoTip
              text="The shortest session customers can book. Above 1 hour, bookings go up in 30-minute steps (1 hr, 1 hr 30, 2 hr, …) no matter what you pick here."
              label="About shortest booking"
            />
          </span>
          <div className="inline-flex w-full gap-1 rounded-xl border border-border bg-surface p-1" role="radiogroup" aria-label="Shortest booking">
            {MIN_OPTIONS.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={o.minBookingMinutes === value}
                onClick={() => onChange({ minBookingMinutes: value })}
                className={cn(
                  'h-9 flex-1 rounded-lg text-body font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                  o.minBookingMinutes === value ? 'bg-card text-text-primary shadow-sm' : 'text-text-secondary hover:text-text-primary'
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </span>
        <label className="flex flex-col gap-1.5">
          <span className="flex items-center gap-0.5 text-overline font-semibold text-text-secondary">
            Checkout starts at
            <InfoTip text="The session length customers see first at checkout. They can still change it." label="About default booking length" />
          </span>
          <select
            className={selectCls}
            value={o.defaultBookingMinutes ?? ''}
            onChange={(e) => onChange({ defaultBookingMinutes: e.target.value ? Number(e.target.value) : null })}
          >
            <option value="">Standard (2 hr)</option>
            {DEFAULT_OPTIONS.filter((m) => allowed.includes(m)).map((m) => (
              <option key={m} value={m}>{fmt(m)}</option>
            ))}
          </select>
        </label>
      </div>

      {o.minBookingMinutes < 60 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {o.minBookingMinutes <= 15 && (
            <span className="flex flex-col gap-1.5">
              <span className="flex items-center gap-0.5 text-overline font-semibold text-text-secondary">
                15-min price
                <InfoTip
                  text="What a customer pays for a 15-minute session. Leave it blank to keep it at a quarter of your hourly rate."
                  label="About the 15-minute price"
                />
              </span>
              <NumericField
                label="₹"
                min={0}
                value={o.price15m ?? Math.round((hourly / 4) * 100) / 100}
                onChange={(n) => onChange({ price15m: n })}
              />
            </span>
          )}
          <span className="flex flex-col gap-1.5">
            <span className="flex items-center gap-0.5 text-overline font-semibold text-text-secondary">
              30-min price
              <InfoTip
                text="What a customer pays for a 30-minute session. Leave it blank to keep it at half your hourly rate."
                label="About the 30-minute price"
              />
            </span>
            <NumericField
              label="₹"
              min={0}
              value={o.price30m ?? Math.round((hourly / 2) * 100) / 100}
              onChange={(n) => onChange({ price30m: n })}
            />
          </span>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full text-caption">
          <thead>
            <tr className="border-b border-border">
              <th className="px-3 py-2 text-left font-semibold text-text-secondary">Length</th>
              {playerCounts.map((p) => (
                <th key={p} className="px-3 py-2 text-right font-semibold text-text-secondary">
                  {playerCounts.length > 1 ? `${p}P` : 'Price'}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {previewLengths.map((m) => {
              const base = priceForMinutes(m, hourly, o.price15m, o.price30m);
              const isOwnerSet = (m === 15 && o.price15m != null) || (m === 30 && o.price30m != null) || m === 60;
              return (
                <tr key={m} className="border-b border-border/60 last:border-0">
                  <td className="px-3 py-2 text-text-primary">{fmt(m)}</td>
                  {playerCounts.map((p) => {
                    const extra = showCoop && o.coopEnabled ? (o.coopExtraPlayerPrice * (p - 1) * m) / 60 : 0;
                    const total = Math.round((base + extra) * 100) / 100;
                    return (
                      <td
                        key={p}
                        className={cn('px-3 py-2 text-right font-data', isOwnerSet && p === 1 ? 'font-bold text-accent' : 'text-text-primary')}
                      >
                        ₹{total}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="flex items-start gap-1 border-t border-border px-3 py-2 text-caption text-text-secondary">
          <InfoTip
            text="Exactly what customers will pay. The bold red numbers are prices you set; the rest are worked out from your hourly rate."
            label="About this preview"
            quiet
          />
          What customers will pay, worked out live from what&apos;s above.
        </p>
      </div>
    </div>
  );
}
