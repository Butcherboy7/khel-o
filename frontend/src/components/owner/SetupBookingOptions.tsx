'use client';

import { Users } from 'lucide-react';
import { InfoTip } from '@/components/shared/InfoTip';
import { NumericField } from '@/components/ui';
import { cn } from '@/lib/cn';
import type { TierConfig } from '@/types';

const MIN_OPTIONS = [15, 30, 45, 60, 90, 120];
const DEFAULT_OPTIONS = [15, 30, 45, 60, 90, 120, 180];

const fmt = (m: number) => (m < 60 ? `${m} min` : m % 60 === 0 ? `${m / 60} hr` : `${(m / 60).toFixed(1)} hr`);

/** New-tier defaults and the edit-modal prefill share one shape. */
type BookingOptionFields = Pick<TierConfig, 'coopEnabled' | 'coopMaxPlayers' | 'coopExtraPlayerPrice' | 'minBookingMinutes' | 'defaultBookingMinutes'>;

export function bookingOptionsFrom(src: BookingOptionFields | undefined) {
  return {
    coopEnabled: src?.coopEnabled ?? false,
    coopMaxPlayers: src?.coopMaxPlayers ?? 2,
    coopExtraPlayerPrice: src?.coopExtraPlayerPrice ?? 0,
    minBookingMinutes: src?.minBookingMinutes ?? 60,
    defaultBookingMinutes: src?.defaultBookingMinutes ?? null,
  };
}

/** What a create/update payload sends. Co-op only exists for consoles. */
export function bookingOptionsPayload(config: TierConfig) {
  const o = bookingOptionsFrom(config);
  const minutes = {
    minBookingMinutes: o.minBookingMinutes,
    defaultBookingMinutes: o.defaultBookingMinutes && o.defaultBookingMinutes >= o.minBookingMinutes ? o.defaultBookingMinutes : null,
  };
  if (config.tierType === 'activity' || config.platform === 'pc') return { ...minutes, coopEnabled: false };
  return { ...minutes, coopEnabled: o.coopEnabled, coopMaxPlayers: o.coopMaxPlayers, coopExtraPlayerPrice: o.coopExtraPlayerPrice };
}

interface Props {
  config: TierConfig;
  onChange: (patch: Partial<TierConfig>) => void;
}

/**
 * Co-op pricing (consoles only) and booking-length limits for one setup.
 * Sits under "Price per hour" inside the configurator card.
 */
export function SetupBookingOptions({ config, onChange }: Props) {
  const o = bookingOptionsFrom(config);
  const showCoop = config.tierType !== 'activity' && config.platform !== 'pc';
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
                  'absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200',
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
              <NumericField
                label="Extra per extra player (₹/hr)"
                min={0}
                value={o.coopExtraPlayerPrice}
                onChange={(n) => onChange({ coopExtraPlayerPrice: n })}
              />
              <div className="rounded-lg bg-surface px-3 py-2 text-caption sm:col-span-2">
                <span className="text-text-secondary">Customers see: </span>
                {Array.from({ length: o.coopMaxPlayers }, (_, i) => i + 1).map((p, i) => {
                  const rate = config.pricePerHour + o.coopExtraPlayerPrice * (p - 1);
                  return (
                    <span key={p} className="whitespace-nowrap text-text-primary">
                      {i > 0 && <span className="text-text-secondary/50"> · </span>}
                      {p}P <span className="font-data font-bold">₹{rate}/hr</span>
                    </span>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="flex items-center gap-0.5 text-overline font-semibold text-text-secondary">
            Shortest booking
            <InfoTip text="The least time a customer can book. VR and arcade often work best at 15 minutes." label="About shortest booking" />
          </span>
          <select
            className={selectCls}
            value={o.minBookingMinutes}
            onChange={(e) => onChange({ minBookingMinutes: Number(e.target.value) })}
          >
            {MIN_OPTIONS.map((m) => (
              <option key={m} value={m}>{fmt(m)}</option>
            ))}
          </select>
        </label>
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
            {DEFAULT_OPTIONS.filter((m) => m >= o.minBookingMinutes).map((m) => (
              <option key={m} value={m}>{fmt(m)}</option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}
