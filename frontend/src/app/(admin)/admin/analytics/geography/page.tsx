'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Check, Copy, MapPin } from 'lucide-react';
import { getAreaReport, getGeography, type AreaReport, type AreaRow } from '@/lib/api/adminAnalytics';
import { formatCurrency } from '@/lib/format';
import { SkeletonCard } from '@/components/ui';
import { cn } from '@/lib/cn';

/** The backend's catch-all bucket for cafés whose address names no neighbourhood. */
const OTHER_AREA = 'Other areas';
/** Below this many shared locations, "where players live" is guesswork. */
const ENOUGH_LOCATIONS = 10;

const hourLabel = (h: number) => `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? 'AM' : 'PM'}`;
const rupees = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
const people = (n: number) => `${n} ${n === 1 ? 'person' : 'people'}`;
const areaName = (a: string) => (a === OTHER_AREA ? 'Address unclear' : a);

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

/** The whole page in two plain sentences. */
function summary(r: AreaReport): string {
  const t = r.totals;
  if (t.visitors === 0 && r.areas.every((a) => a.cafeViewers === 0)) {
    return `Nobody has browsed ${r.city} in the last ${r.days} days yet.`;
  }
  const parts = [`In the last ${r.days} days, ${people(t.visitors)} browsed ${r.city}.`];
  const did: string[] = [];
  if (t.cafeViewers) did.push(`${t.cafeViewers} opened a café page`);
  if (t.notifyMe) did.push(`${t.notifyMe} asked to be told when a café opens bookings`);
  did.push(t.bookings ? `${t.bookings} booked, paying ${rupees(t.gmv)}` : 'nobody has booked yet');
  parts.push(`${did.join(', ').replace(/^./, (c) => c.toUpperCase())}.`);
  const top = r.areas.find((a) => a.area !== OTHER_AREA && a.cafeViewers > 0);
  if (top) parts.push(`${top.area} gets the most attention.`);
  return parts.join(' ');
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-xl bg-surface p-3">
      <span className="text-caption text-text-secondary">{label}</span>
      <span className="font-data text-h2 font-bold tabular-nums text-text-primary">{value}</span>
      {note && <span className="text-[12px] text-text-tertiary">{note}</span>}
    </div>
  );
}

function NeighbourhoodTable({ report, onCopy, copied }: { report: AreaReport; onCopy: (a: AreaRow) => void; copied: string | null }) {
  const areas = report.areas;
  const showLiving = report.totals.sharedLocation >= ENOUGH_LOCATIONS;
  const maxLooked = Math.max(1, ...areas.map((a) => a.cafeViewers));
  const th = 'px-3 py-2.5 font-semibold';
  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-card">
      <table className="w-full min-w-[760px] text-body">
        <thead className="bg-surface text-left text-caption text-text-secondary">
          <tr>
            <th className={th}>Neighbourhood</th>
            <th className={th}>Cafés</th>
            <th className={th}>People who opened a café here</th>
            {showLiving && <th className={cn(th, 'text-right')}>Players living here</th>}
            <th className={cn(th, 'text-right')}>Asked to be notified</th>
            <th className={cn(th, 'text-right')}>Bookings</th>
            <th className={cn(th, 'text-right')}>Money in</th>
            <th className={th}>Busiest time</th>
            <th className={cn(th, 'text-right')}>
              <span className="sr-only">Pitch line</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {areas.map((a) => (
            <tr key={a.area} className="border-t border-border align-middle">
              <td className="px-3 py-3">
                <div className="font-semibold text-text-primary">{areaName(a.area)}</div>
                {a.area === OTHER_AREA && (
                  <div className="text-[12px] text-text-tertiary">Café address doesn&apos;t name a neighbourhood</div>
                )}
              </td>
              <td className="px-3 py-3 text-caption text-text-secondary">
                {a.cafes.live + a.cafes.comingSoon === 0 ? (
                  'None yet'
                ) : (
                  <>
                    {a.cafes.live > 0 && <span className="text-text-primary">{a.cafes.live} taking bookings</span>}
                    {a.cafes.live > 0 && a.cafes.comingSoon > 0 && <br />}
                    {a.cafes.comingSoon > 0 && <span>{a.cafes.comingSoon} booking soon</span>}
                  </>
                )}
              </td>
              <td className="px-3 py-3">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-24 shrink-0 overflow-hidden rounded-full bg-surface" aria-hidden>
                    <div className="h-full rounded-full bg-primary" style={{ width: `${(a.cafeViewers / maxLooked) * 100}%` }} />
                  </div>
                  <span className="font-data font-bold tabular-nums text-text-primary">{a.cafeViewers}</span>
                </div>
              </td>
              {showLiving && <td className="px-3 py-3 text-right tabular-nums">{a.playersNearby || '—'}</td>}
              <td className="px-3 py-3 text-right tabular-nums">{a.notifyMe || '—'}</td>
              <td className="px-3 py-3 text-right tabular-nums">{a.bookings || '—'}</td>
              <td className="px-3 py-3 text-right">
                <div className="tabular-nums text-text-primary">{a.gmv ? rupees(a.gmv) : '—'}</div>
                {a.bookings > 0 && a.avgBookingValue && (
                  <div className="text-[12px] text-text-tertiary">{rupees(a.avgBookingValue)} a booking</div>
                )}
              </td>
              <td className="px-3 py-3 text-caption text-text-secondary">
                {a.peakDay && a.peakHour !== null ? (
                  <>
                    {a.peakDay}s, {hourLabel(a.peakHour)}
                    {a.lowData && <div className="text-[12px] text-text-tertiary">only {a.bookings} bookings, a rough guess</div>}
                  </>
                ) : (
                  '—'
                )}
              </td>
              <td className="px-3 py-3 text-right">
                {a.area !== OTHER_AREA && (
                  <button
                    type="button"
                    onClick={() => onCopy(a)}
                    title={pitchFor(a, report.days)}
                    className="inline-flex min-h-[36px] items-center gap-1.5 whitespace-nowrap rounded-lg border border-border px-3 text-caption font-semibold text-text-primary hover:bg-surface"
                  >
                    {copied === a.area ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
                    {copied === a.area ? 'Copied' : 'Copy pitch'}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
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
  const maxCities = Math.max(1, ...(report?.cities ?? []).map((c) => c.sessions));

  const copyPitch = async (a: AreaRow) => {
    if (!report) return;
    try {
      await navigator.clipboard.writeText(pitchFor(a, report.days));
      setCopied(a.area);
      setTimeout(() => setCopied(null), 2000);
    } catch {}
  };

  const shared = report?.totals.sharedLocation ?? 0;

  return (
    <div className="flex flex-col gap-6 pb-12">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <MapPin className="h-6 w-6 text-primary" />
            <h1 className="font-heading text-h1 text-text-primary">Areas</h1>
          </div>
          <p className="max-w-2xl text-body text-text-secondary">
            Which neighbourhoods players are interested in, and which ones already make money. Use it to decide which
            cafés to sign up next and what to tell their owners.
          </p>
        </div>
        <div className="flex gap-2">
          <select aria-label="City" value={city} onChange={(e) => setCity(e.target.value)} className="min-h-input rounded-lg border border-border bg-card px-3 text-body">
            {cityOptions.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <select aria-label="Period" value={days} onChange={(e) => setDays(Number(e.target.value))} className="min-h-input rounded-lg border border-border bg-card px-3 text-body">
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
          <section className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-4 md:p-5">
            <p className="max-w-3xl text-[17px] leading-relaxed text-text-primary">{summary(report)}</p>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Stat label={`People browsing ${report.city}`} value={String(report.totals.visitors)} />
              <Stat label="Opened a café page" value={String(report.totals.cafeViewers ?? '—')} />
              <Stat label="Asked to be notified" value={String(report.totals.notifyMe ?? '—')} note="For cafés not on KHEL-O yet" />
              <Stat
                label="Bookings"
                value={String(report.totals.bookings)}
                note={report.totals.bookings ? `${rupees(report.totals.gmv)} paid in total` : undefined}
              />
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <div>
              <h2 className="font-heading text-h3 text-text-primary">Neighbourhoods</h2>
              <p className="text-caption text-text-secondary">
                Grouped by where each café is. Most interest at the top. “Copy pitch” gives you a line to send a café
                owner in that area.
              </p>
            </div>
            {report.areas.length === 0 ? (
              <p className="rounded-2xl border border-border bg-card p-4 text-caption text-text-secondary">
                No cafés or visits in {report.city} yet.
              </p>
            ) : (
              <NeighbourhoodTable report={report} onCopy={copyPitch} copied={copied} />
            )}
            {shared < ENOUGH_LOCATIONS && (
              <p className="rounded-lg bg-surface px-3 py-2 text-caption text-text-secondary">
                Only {people(shared)} shared their location so far, so we can&apos;t yet tell where players live. Once
                {' '}{ENOUGH_LOCATIONS} or more do, a “Players living here” column appears.
              </p>
            )}
          </section>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
              <div>
                <h2 className="font-heading text-h3 text-text-primary">Players who travel to play</h2>
                <p className="text-caption text-text-secondary">
                  Someone who lives in one area looking at cafés in another. Tells you which areas pull players in.
                </p>
              </div>
              {report.flows.length === 0 ? (
                <p className="text-caption text-text-secondary">
                  Nothing yet. This needs players to share their location ({shared} so far).
                </p>
              ) : (
                <ul className="flex flex-col divide-y divide-border">
                  {report.flows.map((f) => (
                    <li key={`${f.from}-${f.to}`} className="flex items-center justify-between gap-2 py-2 text-body">
                      <span className="flex items-center gap-1.5 text-text-primary">
                        Lives in {f.from} <ArrowRight className="h-3.5 w-3.5 text-text-secondary" /> looked at {f.to}
                      </span>
                      <span className="font-data font-bold tabular-nums">{f.sessions}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
              <div>
                <h2 className="font-heading text-h3 text-text-primary">Which city people picked</h2>
                <p className="text-caption text-text-secondary">People by the city they chose or were found in, last {report.days} days.</p>
              </div>
              {report.cities.length === 0 ? (
                <p className="text-caption text-text-secondary">Nobody has picked a city yet.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {report.cities.slice(0, 8).map((c) => (
                    <li key={c.city} className="grid grid-cols-[7rem_minmax(0,1fr)_3rem] items-center gap-2 text-caption">
                      <span className="truncate text-text-primary">{c.city}</span>
                      <div className="h-2 overflow-hidden rounded-full bg-surface" aria-hidden>
                        <div className="h-full rounded-full bg-secondary" style={{ width: `${(c.sessions / maxCities) * 100}%` }} />
                      </div>
                      <span className="text-right font-data font-bold tabular-nums text-text-primary">{c.sessions}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </>
      )}

      {cityTable && cityTable.length > 0 && (
        <section className="flex flex-col gap-2">
          <div>
            <h2 className="font-heading text-h3 text-text-primary">Every city, since launch</h2>
            <p className="text-caption text-text-secondary">Paid bookings only.</p>
          </div>
          <div className="overflow-x-auto rounded-2xl border border-border bg-card">
            <table className="w-full text-body">
              <thead className="bg-surface text-caption text-text-secondary">
                <tr>
                  <th className="px-3 py-2.5 text-left font-semibold">City</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Cafés</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Bookings</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Money in</th>
                </tr>
              </thead>
              <tbody>
                {[...cityTable].sort((a, b) => b.gmv - a.gmv).map((row) => (
                  <tr key={row.city} className="border-t border-border">
                    <td className="px-3 py-3 font-semibold">{row.city}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{row.cafeCount}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{row.bookings}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{row.gmv ? rupees(row.gmv) : '—'}</td>
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
