'use client';

import { Moon, Plus, Sun, X } from 'lucide-react';
import type { LengthPrice, TimePrice } from '@/lib/api/drops';
import { clock, dropSeatPrice, rupees } from '@/lib/drops';

/** Packages (1 hr ₹250, 3 hrs ₹650, 5 hrs ₹850) and different prices at some hours
 *  (cheaper after midnight, more at peak). Both optional; the hourly price is the default. */
export interface PriceOptions {
  lengthPrices: LengthPrice[];
  timePrices: TimePrice[];
}

const field = 'h-11 w-full min-w-0 rounded-lg border border-border bg-card px-2 text-body text-text-primary tabular-nums';
const num = (v: string) => Number(v.replace(/\D/g, '').slice(0, 5)) || 0;

const PRESETS: { label: string; icon: typeof Moon; band: (base: number) => TimePrice }[] = [
  { label: 'Late night, 12 AM to 6 AM', icon: Moon, band: (b) => ({ start: '00:00', end: '06:00', perHour: Math.max(50, b - 50) }) },
  { label: 'Peak, 6 PM to 9 PM', icon: Sun, band: (b) => ({ start: '18:00', end: '21:00', perHour: b + 50 }) },
];

/** Times as minutes from midnight; an end at or before the start runs past midnight. */
const minutesSet = (t: TimePrice) => {
  const [sh, sm] = t.start.split(':').map(Number);
  const [eh, em] = t.end.split(':').map(Number);
  const s = sh * 60 + sm;
  let e = eh * 60 + em;
  if (e <= s) e += 1440;
  const out = new Set<number>();
  for (let m = s; m < e; m += 30) out.add(m % 1440);
  return out;
};

export function overlapping(bands: TimePrice[]): boolean {
  const seen = new Set<number>();
  for (const b of bands) {
    for (const m of Array.from(minutesSet(b))) {
      if (seen.has(m)) return true;
      seen.add(m);
    }
  }
  return false;
}

export function DropPriceOptions({ base, value, onChange }: { base: number; value: PriceOptions; onChange: (v: PriceOptions) => void }) {
  const { lengthPrices: packs, timePrices: bands } = value;
  const setPacks = (p: LengthPrice[]) => onChange({ ...value, lengthPrices: p });
  const setBands = (b: TimePrice[]) => onChange({ ...value, timePrices: b });
  const usedHours = new Set(packs.map((p) => p.hours));
  const nextHours = [1, 2, 3, 4, 5, 6, 8, 10, 12].find((h) => !usedHours.has(h));
  const clash = overlapping(bands);
  const sample = { pricePerHour: base, maxHours: 5, lengthPrices: packs.filter((p) => p.price > 0), timePrices: bands.filter((b) => b.perHour > 0) };
  const sampleHours = packs.find((p) => p.hours >= 2)?.hours ?? packs[0]?.hours ?? 2;

  return (
    <div className="flex flex-col gap-5">
      {/* Packages */}
      <section className="flex flex-col gap-2">
        <label className="flex min-h-[44px] items-center gap-3">
          <input
            type="checkbox"
            className="h-5 w-5 accent-primary"
            checked={packs.length > 0}
            onChange={(e) =>
              setPacks(e.target.checked ? [{ hours: 1, price: base }, { hours: 3, price: Math.round(base * 2.6) }, { hours: 5, price: Math.round(base * 3.4) }] : [])
            }
          />
          <span className="min-w-0">
            <span className="block font-semibold text-text-primary">Sell packages</span>
            <span className="block text-caption text-text-secondary">Like 1 hour ₹250, 3 hours ₹650, 5 hours ₹850. Players can only pick these lengths.</span>
          </span>
        </label>
        {packs.length > 0 && (
          <div className="flex flex-col gap-2 rounded-xl bg-surface-hover p-3">
            {packs.map((p, i) => {
              const plain = base * p.hours;
              const saves = plain - p.price;
              return (
                <div key={i} className="grid grid-cols-[5.5rem_1fr_auto] items-center gap-2">
                  <select
                    aria-label="Hours"
                    value={p.hours}
                    onChange={(e) => setPacks(packs.map((x, j) => (j === i ? { ...x, hours: Number(e.target.value) } : x)))}
                    className={field}
                  >
                    {[1, 2, 3, 4, 5, 6, 7, 8, 10, 12].map((h) => (
                      <option key={h} value={h} disabled={h !== p.hours && usedHours.has(h)}>
                        {h} {h === 1 ? 'hour' : 'hours'}
                      </option>
                    ))}
                  </select>
                  <div className="flex min-w-0 flex-col">
                    <div className="relative">
                      <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-text-secondary">₹</span>
                      <input
                        aria-label={`Price for ${p.hours} hours`}
                        inputMode="numeric"
                        value={p.price || ''}
                        onChange={(e) => setPacks(packs.map((x, j) => (j === i ? { ...x, price: num(e.target.value) } : x)))}
                        className={`${field} pl-6`}
                      />
                    </div>
                    {p.price > 0 && base > 0 && p.hours > 1 && (
                      <span className={`mt-0.5 text-caption ${saves > 0 ? 'text-success' : 'text-text-secondary'}`}>
                        {saves > 0 ? `${rupees(saves)} less than ${p.hours} × ${rupees(base)}` : saves < 0 ? `More than ${p.hours} × ${rupees(base)}` : 'Same as the hourly price'}
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    aria-label={`Remove the ${p.hours} hour package`}
                    onClick={() => setPacks(packs.filter((_, j) => j !== i))}
                    className="flex h-11 w-11 items-center justify-center rounded-lg text-text-secondary hover:bg-card hover:text-error"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
            {nextHours && packs.length < 8 && (
              <button
                type="button"
                onClick={() => setPacks([...packs, { hours: nextHours, price: base * nextHours }].sort((a, b) => a.hours - b.hours))}
                className="inline-flex min-h-[44px] items-center gap-1.5 self-start font-semibold text-primary"
              >
                <Plus className="h-4 w-4" /> Add a package
              </button>
            )}
          </div>
        )}
      </section>

      {/* Time prices */}
      <section className="flex flex-col gap-2">
        <div>
          <p className="font-semibold text-text-primary">Different price at some hours</p>
          <p className="text-caption text-text-secondary">
            Cheaper late at night, more at peak time. Each hour inside these times costs this much instead of {rupees(base || 0)}.
            {packs.length > 0 ? ' Packages go up or down by the difference.' : ''}
          </p>
        </div>
        {bands.map((b, i) => {
          const diff = b.perHour - base;
          return (
            <div key={i} className="flex flex-col gap-2 rounded-xl bg-surface-hover p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="min-w-0 text-caption font-semibold text-text-primary">
                  {clock(b.start || '00:00')} to {clock(b.end || '00:00')}
                  {b.perHour > 0 && base > 0 && diff !== 0 && (
                    <span className={diff < 0 ? 'text-success' : 'text-text-secondary'}> · {rupees(Math.abs(diff))} {diff < 0 ? 'less' : 'more'} an hour</span>
                  )}
                </p>
                <button
                  type="button"
                  aria-label={`Remove ${clock(b.start)} to ${clock(b.end)}`}
                  onClick={() => setBands(bands.filter((_, j) => j !== i))}
                  className="-my-2 flex h-11 w-11 flex-none items-center justify-center rounded-lg text-text-secondary hover:bg-card hover:text-error"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <label className="flex min-w-0 flex-col gap-1 text-caption text-text-secondary">
                  From
                  <input type="time" step={1800} value={b.start} onChange={(e) => setBands(bands.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)))} className={field} />
                </label>
                <label className="flex min-w-0 flex-col gap-1 text-caption text-text-secondary">
                  Until
                  <input type="time" step={1800} value={b.end} onChange={(e) => setBands(bands.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)))} className={field} />
                </label>
                <label className="col-span-2 flex min-w-0 flex-col gap-1 text-caption text-text-secondary sm:col-span-1">
                  Price an hour
                  <span className="relative">
                    <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-text-secondary">₹</span>
                    <input
                      inputMode="numeric"
                      value={b.perHour || ''}
                      onChange={(e) => setBands(bands.map((x, j) => (j === i ? { ...x, perHour: num(e.target.value) } : x)))}
                      className={`${field} pl-6`}
                    />
                  </span>
                </label>
              </div>
            </div>
          );
        })}
        {clash && <p className="text-caption font-semibold text-error">Two of these cover the same hours. Change one so they don’t overlap.</p>}
        {bands.length < 6 && (
          <div className="flex flex-wrap gap-2">
            {PRESETS.filter((p) => !bands.some((b) => b.start === p.band(base).start)).map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => setBands([...bands, p.band(base || 250)])}
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-border bg-card px-3 text-caption font-semibold text-text-primary hover:border-primary/50"
              >
                <p.icon className="h-4 w-4 text-primary" /> {p.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setBands([...bands, { start: '12:00', end: '15:00', perHour: base || 250 }])}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-dashed border-border px-3 text-caption font-semibold text-text-secondary hover:border-primary/50"
            >
              <Plus className="h-4 w-4" /> Other hours
            </button>
          </div>
        )}
      </section>

      {/* What players will pay */}
      {base > 0 && (packs.length > 0 || bands.length > 0) && !clash && (
        <div className="rounded-xl border border-border px-3 py-2.5">
          <p className="text-caption font-semibold text-text-primary">What a player pays for {sampleHours} {sampleHours === 1 ? 'hour' : 'hours'}</p>
          <dl className="mt-1 grid grid-cols-3 gap-2 text-center">
            {[
              ['From 2 PM', 14 * 60],
              ['From 7 PM', 19 * 60],
              ['From 1 AM', 25 * 60],
            ].map(([label, m]) => (
              <div key={label as string}>
                <dt className="text-caption text-text-secondary">{label as string}</dt>
                <dd className="font-heading text-body-emphasis font-bold tabular-nums text-text-primary">{rupees(dropSeatPrice(sample, m as number, sampleHours))}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  );
}

/** What the API takes: only filled-in rows. */
export function priceOptionsPayload(v: PriceOptions): PriceOptions {
  return { lengthPrices: v.lengthPrices.filter((p) => p.price > 0), timePrices: v.timePrices.filter((b) => b.perHour > 0 && b.start !== b.end) };
}
