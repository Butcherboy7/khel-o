'use client';

import { useState } from 'react';
import { AlertTriangle, Users } from 'lucide-react';
import { InfoTip } from '@/components/shared/InfoTip';
import { NumericField } from '@/components/ui';
import { cn } from '@/lib/cn';
import { basePriceForMinutes } from '@/lib/pricing';
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

const MAX_MINUTES = 480;
/** Choices for "Longest booking": 1 hr to 8 hr in 30-minute steps. */
const LONGEST_OPTIONS = Array.from({ length: (MAX_MINUTES - 60) / 30 + 1 }, (_, i) => 60 + i * 30);
/** With no limit set, the price table shows up to this length until the
 *  owner asks for the rest (8 hours of rows is a lot on a phone). */
const TABLE_FOLD = 240;

/** Every bookable length for a setup whose shortest booking is `min` and
 *  longest is `max` (null = 8 hours) — mirrors app/core/duration.py's
 *  allowed_minutes exactly. */
export function allowedMinutes(min: 15 | 30 | 60, max?: number | null): number[] {
  const longest = Math.min(max ?? MAX_MINUTES, MAX_MINUTES);
  const lengths = [15, 30].filter((m) => m >= min);
  for (let m = 60; m <= MAX_MINUTES; m += 30) lengths.push(m);
  return lengths.filter((m) => m <= longest);
}

/** New-tier defaults and the edit-modal prefill share one shape. */
type BookingOptionFields = Pick<
  TierConfig,
  | 'coopEnabled'
  | 'coopMaxPlayers'
  | 'coopExtraPlayerPrice'
  | 'minBookingMinutes'
  | 'defaultBookingMinutes'
  | 'price15m'
  | 'price30m'
  | 'coopPrice30m'
  | 'lengthPrices'
  | 'maxBookingMinutes'
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
    coopPrice30m: src?.coopPrice30m ?? null,
    lengthPrices: src?.lengthPrices ?? {},
    maxBookingMinutes: src?.maxBookingMinutes ?? null,
  };
}

/** Prices the owner typed (packages, 15/30-min prices, the hourly rate) that
 *  are lower than a shorter length they also typed. Allowed, but usually a
 *  typo, so the screen warns before saving. Worked-out rows are never
 *  flagged: they only follow from what the owner typed. */
export function cheaperLongerLengths(
  rows: { minutes: number; price: number; own: boolean }[]
): { longer: number; shorter: number }[] {
  const owned = rows.filter((r) => r.own);
  const out: { longer: number; shorter: number }[] = [];
  owned.forEach((row, i) => {
    const pricier = owned.slice(0, i).filter((r) => r.price > row.price).pop();
    if (pricier) out.push({ longer: row.minutes, shorter: pricier.minutes });
  });
  return out;
}

/** What a create/update payload sends. Co-op only exists for consoles. */
export function bookingOptionsPayload(config: TierConfig) {
  const o = bookingOptionsFrom(config);
  const allowed = allowedMinutes(o.minBookingMinutes, o.maxBookingMinutes);
  // Only packages the setup can actually be booked for (and that aren't the
  // 1-hour rate itself); the backend rejects anything past the longest booking.
  const lengthPrices = Object.fromEntries(
    Object.entries(o.lengthPrices).filter(([k, v]) => Number(k) >= 90 && allowed.includes(Number(k)) && Number(v) > 0)
  );
  const minutes = {
    minBookingMinutes: o.minBookingMinutes,
    maxBookingMinutes: o.maxBookingMinutes,
    lengthPrices,
    defaultBookingMinutes: o.defaultBookingMinutes && allowed.includes(o.defaultBookingMinutes) ? o.defaultBookingMinutes : null,
    // A 15-min price only means something when 15 min is actually bookable
    // (same for 30) — clear it rather than send a stale value the backend
    // would reject once "Shortest booking" moves up past it.
    price15m: o.minBookingMinutes <= 15 ? o.price15m : null,
    price30m: o.minBookingMinutes <= 30 ? o.price30m : null,
  };
  if (config.tierType === 'activity' || config.platform === 'pc') return { ...minutes, coopEnabled: false };
  return {
    ...minutes,
    coopEnabled: o.coopEnabled,
    coopMaxPlayers: o.coopMaxPlayers,
    coopExtraPlayerPrice: o.coopExtraPlayerPrice,
    coopPrice30m: o.coopEnabled && o.minBookingMinutes <= 30 ? o.coopPrice30m : null,
  };
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
  const allowed = allowedMinutes(o.minBookingMinutes, o.maxBookingMinutes);
  const [showAllLengths, setShowAllLengths] = useState(false);
  // Every length up to the longest booking. With no limit, fold past 4 hours
  // (or past checkout's starting length, if that's longer) until asked.
  const fold = Math.max(TABLE_FOLD, o.defaultBookingMinutes ?? 0);
  const folded = !showAllLengths && allowed.some((m) => m > fold);
  const previewLengths = folded ? allowed.filter((m) => m <= fold) : allowed;
  const playerCounts = showCoop && o.coopEnabled ? Array.from({ length: o.coopMaxPlayers }, (_, i) => i + 1) : [1];
  const coopOn = showCoop && o.coopEnabled;
  const priced = { ...o, pricePerHour: hourly };
  const priceAt = (m: number, p = 1) => basePriceForMinutes(priced, m, { players: p, isCoop: coopOn && p > 1 });
  const setPackage = (m: number, price: number | null) => {
    const next = { ...o.lengthPrices };
    if (price == null) delete next[String(m)];
    else next[String(m)] = price;
    onChange({ lengthPrices: next });
  };
  const setLongest = (max: number | null) => {
    const patch: Partial<TierConfig> = { maxBookingMinutes: max };
    // Keep checkout's starting length inside the new limit.
    if (max != null && o.defaultBookingMinutes != null && o.defaultBookingMinutes > max) patch.defaultBookingMinutes = null;
    onChange(patch);
  };
  const isOwnPrice = (m: number) =>
    (m === 15 && o.price15m != null) || (m === 30 && o.price30m != null) || m === 60 || (m >= 90 && o.lengthPrices[String(m)] != null);
  const warnings = cheaperLongerLengths(allowed.map((m) => ({ minutes: m, price: priceAt(m), own: isOwnPrice(m) })));
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
            Longest booking
            <InfoTip
              text="The longest session customers can book on this setup. Checkout won't offer anything longer."
              label="About longest booking"
            />
          </span>
          <select
            className={selectCls}
            value={o.maxBookingMinutes ?? ''}
            onChange={(e) => setLongest(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">No limit (8 hr)</option>
            {LONGEST_OPTIONS.filter((m) => m < MAX_MINUTES).map((m) => (
              <option key={m} value={m}>{fmt(m)}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="flex items-center gap-0.5 text-overline font-semibold text-text-secondary">
            Checkout starts at
            <InfoTip
              text="The session length customers see first at checkout. It's only a starting point: they can still pick any length up to your longest booking."
              label="About default booking length"
            />
          </span>
          <select
            className={selectCls}
            value={o.defaultBookingMinutes ?? ''}
            onChange={(e) => onChange({ defaultBookingMinutes: e.target.value ? Number(e.target.value) : null })}
          >
            <option value="">{allowed.includes(120) ? 'Standard (2 hr)' : 'Standard'}</option>
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
          {showCoop && o.coopEnabled && (
            <span className="flex flex-col gap-1.5">
              <span className="flex items-center gap-0.5 text-overline font-semibold text-text-secondary">
                30-min co-op price (2 players)
                <InfoTip
                  text="What 2 players sharing one console pay for 30 minutes. Leave it blank to use your 30-min price plus half the extra-per-friend charge."
                  label="About the 30-minute co-op price"
                />
              </span>
              <NumericField
                label="₹"
                min={0}
                value={o.coopPrice30m ?? Math.round(((o.price30m ?? hourly / 2) + o.coopExtraPlayerPrice / 2) * 100) / 100}
                onChange={(n) => onChange({ coopPrice30m: n })}
              />
            </span>
          )}
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
              const own = o.lengthPrices[String(m)];
              const isOwnerSet = isOwnPrice(m);
              const warned = warnings.some((w) => w.longer === m);
              return (
                <tr key={m} className="border-b border-border/60 last:border-0">
                  <td className="px-3 py-2 text-text-primary">
                    {fmt(m)}
                    {m === 60 && <span className="ml-1 text-text-secondary">(hourly rate)</span>}
                  </td>
                  {playerCounts.map((p) =>
                    p === 1 && m >= 90 ? (
                      <td key={p} className="px-2 py-1 text-right">
                        <PackagePriceInput
                          minutes={m}
                          value={own ?? null}
                          auto={priceAt(m)}
                          warned={warned}
                          onChange={(price) => setPackage(m, price)}
                        />
                      </td>
                    ) : (
                      <td
                        key={p}
                        className={cn('px-3 py-2 text-right font-data', isOwnerSet && p === 1 ? 'font-bold text-accent' : 'text-text-primary')}
                      >
                        ₹{priceAt(m, p)}
                      </td>
                    )
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
        {folded && (
          <button
            type="button"
            onClick={() => setShowAllLengths(true)}
            className="min-h-[40px] w-full border-t border-border text-caption font-semibold text-primary-dark hover:bg-card"
          >
            Show longer sessions (up to {fmt(allowed[allowed.length - 1])})
          </button>
        )}
        {warnings.length > 0 && (
          <p role="status" className="flex items-start gap-1.5 border-t border-border bg-warning/10 px-3 py-2 text-caption text-text-primary">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-warning" aria-hidden />
            <span>
              {warnings
                .slice(0, 2)
                .map((w) => `${fmt(w.longer)} (₹${priceAt(w.longer)}) costs less than ${fmt(w.shorter)} (₹${priceAt(w.shorter)})`)
                .join('; ')}
              {warnings.length > 2 ? ` and ${warnings.length - 2} more` : ''}. Customers will pick the longer one. You can
              still save if that&apos;s what you want.
            </span>
          </p>
        )}
        <p className="flex items-start gap-1 border-t border-border px-3 py-2 text-caption text-text-secondary">
          <InfoTip
            text="Set your own price for any length from 1 hr 30, like 3 hr for ₹400. Leave one blank and it's worked out for you: your nearest shorter price plus the hourly rate for the extra time. Bold red numbers are prices you set."
            label="About this price table"
            quiet
          />
          Exactly what customers pay. Type a price to set your own; leave it blank to use the hourly rate.
        </p>
      </div>
    </div>
  );
}

/** One price cell from 1 hr 30 up: blank shows the worked-out price as a
 *  hint and means "use the hourly rate"; typing a number sets the owner's
 *  own price for that length. */
function PackagePriceInput({
  minutes,
  value,
  auto,
  warned,
  onChange,
}: {
  minutes: number;
  value: number | null;
  auto: number;
  warned: boolean;
  onChange: (price: number | null) => void;
}) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="text-text-secondary" aria-hidden>
        ₹
      </span>
      <input
        type="text"
        inputMode="numeric"
        aria-label={`Price for ${fmt(minutes)}`}
        placeholder={String(auto)}
        value={value ?? ''}
        onChange={(e) => {
          const digits = e.target.value.replace(/[^\d]/g, '').replace(/^0+(?=\d)/, '');
          onChange(digits === '' || Number(digits) === 0 ? null : Number(digits));
        }}
        className={cn(
          'h-9 w-20 rounded-lg border bg-card px-2 text-right font-data text-body placeholder:text-text-secondary/70 focus:outline-none focus:ring-2 focus:ring-primary/30',
          value != null ? 'border-accent font-bold text-accent' : 'border-border text-text-primary',
          warned && 'border-warning'
        )}
      />
    </span>
  );
}
