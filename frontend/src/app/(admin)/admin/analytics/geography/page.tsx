'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Check, Copy, MapPin } from 'lucide-react';
import { getAreaReport, getGeography, type AreaRow } from '@/lib/api/adminAnalytics';
import { formatCurrency, formatCurrencyCompact } from '@/lib/format';
import { SkeletonCard } from '@/components/ui';

const hourLabel = (h: number) => `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? 'AM' : 'PM'}`;

/** One sentence an owner in this area can't argue with. Money figures are
 *  left out until there are enough bookings to mean something. */
function pitchFor(a: AreaRow, days: number): string {
  const bits: string[] = [];
  if (a.playersNearby) bits.push(`${a.playersNearby} players near ${a.area} opened KHEL-O`);
  if (a.cafeViewers) bits.push(`${a.cafeViewers} looked at cafés in ${a.area}`);
  if (a.notifyMe) bits.push(`${a.notifyMe} asked to be notified when a café here opens bookings`);
  let line = `In the last ${days} days, ${bits.join(', ') || `players have been browsing ${a.area}`}.`;
  if (!a.lowData && a.avgBookingValue) {
    line += ` Cafés here averaged ${formatCurrency(a.avgBookingValue)} per booking`;
    if (a.avgHours) line += ` for ${a.avgHours} hrs`;
    if (a.peakDay && a.peakHour !== null) line += `, busiest on ${a.peakDay}s around ${hourLabel(a.peakHour)}`;
    line += '.';
  }
  return line;
}

function Meter({ value, max, tone }: { value: number; max: number; tone: string }) {
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-surface">
      <div className={`h-full rounded-full ${tone}`} style={{ width: `${max ? (value / max) * 100 : 0}%` }} />
    </div>
  );
}

export default function AreasPage() {
  const [city, setCity] = useState('Hyderabad');
  const [days, setDays] = useState(90);
  const [copied, setCopied] = useState<string | null>(null);

  const { data: report, isLoading } = useQuery({
    queryKey: ['admin', 'analytics', 'areas', city, days],
    queryFn: () => getAreaReport(city, days),
    staleTime: 60_000,
  });
  const { data: cityTable } = useQuery({
    queryKey: ['admin', 'analytics', 'geography'],
    queryFn: getGeography,
    staleTime: 60_000,
  });

  const cityOptions = Array.from(new Set(['Hyderabad', ...(report?.cities ?? []).map((c) => c.city)]));
  const areas = report?.areas ?? [];
  const maxPlayers = Math.max(1, ...areas.map((a) => a.playersNearby));
  const maxViewers = Math.max(1, ...areas.map((a) => a.cafeViewers));
  const maxCities = Math.max(1, ...(report?.cities ?? []).map((c) => c.sessions));

  const copy = async (id: string, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="flex flex-col gap-6 pb-12">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <MapPin className="h-6 w-6 text-primary" />
            <h1 className="font-heading text-h1 text-text-primary">Areas</h1>
          </div>
          <p className="text-body text-text-secondary">
            Where players are, where they look, and what cafés in each neighbourhood earn.
          </p>
        </div>
        <div className="flex gap-2">
          <select value={city} onChange={(e) => setCity(e.target.value)} className="min-h-input rounded-lg border border-border bg-card px-3 text-body">
            {cityOptions.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="min-h-input rounded-lg border border-border bg-card px-3 text-body">
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
            <option value={180}>Last 180 days</option>
            <option value={365}>Last year</option>
          </select>
        </div>
      </div>

      {isLoading && <SkeletonCard />}

      {report && (
        <>
          <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
            {[
              { label: `Visitors browsing ${city}`, value: String(report.totals.visitors) },
              { label: 'Shared their location', value: String(report.totals.sharedLocation) },
              { label: 'Bookings', value: String(report.totals.bookings) },
              { label: 'GMV', value: formatCurrencyCompact(report.totals.gmv) },
              { label: 'Avg booking value', value: report.totals.avgBookingValue ? formatCurrency(report.totals.avgBookingValue) : '—' },
            ].map((k) => (
              <div key={k.label} className="rounded-2xl border border-border bg-card p-4">
                <div className="font-heading text-h2 font-bold tabular-nums text-text-primary">{k.value}</div>
                <div className="text-caption text-text-secondary">{k.label}</div>
              </div>
            ))}
          </section>

          <section className="flex flex-col gap-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-heading text-h3 text-text-primary">Neighbourhoods</h2>
              <span className="flex items-center gap-3 text-caption text-text-secondary">
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-primary" />Players nearby</span>
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-secondary" />Looked at cafés here</span>
              </span>
            </div>
            {areas.length === 0 ? (
              <p className="rounded-2xl border border-border bg-card p-4 text-caption text-text-secondary">
                No area data yet. It fills in as visitors share their location and view cafés.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {areas.map((a) => (
                  <li key={a.area} className="grid grid-cols-1 gap-3 rounded-2xl border border-border bg-card p-4 md:grid-cols-[1.2fr_1fr_auto] md:items-center">
                    <div className="flex flex-col gap-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-heading text-body-emphasis text-text-primary">{a.area}</span>
                        <span className="text-caption text-text-secondary">
                          {a.cafes.live} live{a.cafes.comingSoon ? ` · ${a.cafes.comingSoon} booking soon` : ''}
                        </span>
                      </div>
                      <div className="grid grid-cols-[1fr_auto] items-center gap-x-2 gap-y-1 text-caption">
                        <Meter value={a.playersNearby} max={maxPlayers} tone="bg-primary" />
                        <span className="w-8 text-right tabular-nums">{a.playersNearby}</span>
                        <Meter value={a.cafeViewers} max={maxViewers} tone="bg-secondary" />
                        <span className="w-8 text-right tabular-nums">{a.cafeViewers}</span>
                      </div>
                      {a.notifyMe > 0 && <span className="text-caption text-text-secondary">{a.notifyMe} asked to be notified</span>}
                    </div>

                    <dl className="grid grid-cols-3 gap-2 text-caption">
                      <div>
                        <dt className="text-text-secondary">Bookings</dt>
                        <dd className="font-semibold tabular-nums text-text-primary">{a.bookings}</dd>
                      </div>
                      <div>
                        <dt className="text-text-secondary">GMV</dt>
                        <dd className="font-semibold tabular-nums text-text-primary">{formatCurrencyCompact(a.gmv)}</dd>
                      </div>
                      <div>
                        <dt className="text-text-secondary">Avg booking</dt>
                        <dd className="font-semibold tabular-nums text-text-primary">{a.avgBookingValue ? formatCurrency(a.avgBookingValue) : '—'}</dd>
                      </div>
                      <div>
                        <dt className="text-text-secondary">Per hour</dt>
                        <dd className="font-semibold tabular-nums text-text-primary">{a.avgPerHour ? formatCurrency(a.avgPerHour) : '—'}</dd>
                      </div>
                      <div className="col-span-2">
                        <dt className="text-text-secondary">Busiest</dt>
                        <dd className="font-semibold text-text-primary">
                          {a.peakDay && a.peakHour !== null ? `${a.peakDay}s, ${hourLabel(a.peakHour)}` : '—'}
                        </dd>
                      </div>
                      {a.lowData && a.bookings > 0 && (
                        <dd className="col-span-3 text-[11px] text-warning">Small sample: {a.bookings} bookings, not pitch-ready</dd>
                      )}
                    </dl>

                    <button
                      type="button"
                      onClick={() => copy(a.area, pitchFor(a, report.days))}
                      title={pitchFor(a, report.days)}
                      className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-caption font-semibold text-text-primary hover:bg-surface"
                    >
                      {copied === a.area ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
                      {copied === a.area ? 'Copied' : 'Pitch line'}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
              <div>
                <h2 className="font-heading text-h3 text-text-primary">Players travel to play</h2>
                <p className="text-caption text-text-secondary">Players who shared their location, then looked at cafés in another area.</p>
              </div>
              {report.flows.length === 0 ? (
                <p className="text-caption text-text-secondary">Not enough shared locations yet.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {report.flows.map((f) => (
                    <li key={`${f.from}-${f.to}`} className="flex items-center justify-between gap-2 text-caption">
                      <span className="flex items-center gap-1.5 text-text-primary">
                        {f.from} <ArrowRight className="h-3.5 w-3.5 text-text-secondary" /> {f.to}
                      </span>
                      <span className="font-semibold tabular-nums">{f.sessions}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
              <div>
                <h2 className="font-heading text-h3 text-text-primary">Where visitors browse</h2>
                <p className="text-caption text-text-secondary">Unique visitors by the city they picked or were located in.</p>
              </div>
              <ul className="flex flex-col gap-2">
                {report.cities.slice(0, 8).map((c) => (
                  <li key={c.city} className="grid grid-cols-[7rem_1fr_auto] items-center gap-2 text-caption">
                    <span className="truncate text-text-primary">{c.city}</span>
                    <Meter value={c.sessions} max={maxCities} tone="bg-secondary" />
                    <span className="w-10 text-right tabular-nums">{c.sessions}</span>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </>
      )}

      {cityTable && (
        <section className="flex flex-col gap-2">
          <h2 className="font-heading text-h3 text-text-primary">All cities, all time</h2>
          <div className="overflow-x-auto rounded-2xl border border-border">
            <table className="w-full text-body">
              <thead className="bg-surface text-caption text-text-secondary">
                <tr>
                  <th className="p-3 text-left">City</th>
                  <th className="p-3 text-right">Cafés</th>
                  <th className="p-3 text-right">Bookings</th>
                  <th className="p-3 text-right">GMV</th>
                </tr>
              </thead>
              <tbody>
                {[...cityTable].sort((a, b) => b.gmv - a.gmv).map((row) => (
                  <tr key={row.city} className="border-t border-border">
                    <td className="p-3 font-semibold">{row.city}</td>
                    <td className="p-3 text-right">{row.cafeCount}</td>
                    <td className="p-3 text-right">{row.bookings}</td>
                    <td className="p-3 text-right">{formatCurrencyCompact(row.gmv)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
