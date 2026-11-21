'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowDown, RefreshCw } from 'lucide-react';
import { getConversion, type ConversionPageRow, type ConversionReport, type FunnelStep } from '@/lib/api/adminAnalytics';
import { Button, SkeletonCard, ErrorState } from '@/components/ui';
import { cn } from '@/lib/cn';

const RANGES = [7, 30, 90] as const;

const fmt = (n: number | null | undefined) => (n == null ? '–' : n.toLocaleString('en-IN'));
const pct = (n: number | null | undefined) => (n == null ? '–' : `${n}%`);
const secs = (n: number | null | undefined) => {
  if (n == null) return '–';
  if (n < 60) return `${n}s`;
  return `${Math.floor(n / 60)}m ${String(n % 60).padStart(2, '0')}s`;
};

function Section({ title, hint, children, id }: { title: string; hint?: string; children: React.ReactNode; id?: string }) {
  return (
    <section id={id} className="flex flex-col gap-3 scroll-mt-20">
      <div>
        <h2 className="font-heading text-h3 text-text-primary">{title}</h2>
        {hint && <p className="mt-0.5 max-w-[70ch] text-caption text-text-secondary">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function Funnel({ title, steps }: { title: string; steps: FunnelStep[] }) {
  const top = Math.max(1, steps[0]?.sessions ?? 1);
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4">
      <h3 className="text-body font-semibold text-text-primary">{title}</h3>
      <ol className="flex flex-col gap-1.5">
        {steps.map((s, i) => {
          const worst = i > 0 && s.fromPrevious != null && s.fromPrevious < 25 && steps[i - 1].sessions >= 5;
          return (
            <li key={s.key} className="flex flex-col gap-1">
              {i > 0 && (
                <span className={cn('flex items-center gap-1 pl-1 text-caption', worst ? 'font-semibold text-error' : 'text-text-secondary')}>
                  <ArrowDown className="h-3.5 w-3.5" aria-hidden />
                  {pct(s.fromPrevious)} carried on{s.lost > 0 && ` · ${fmt(s.lost)} stopped`}
                </span>
              )}
              <div className="flex items-center gap-3">
                <div className="relative h-8 flex-1 overflow-hidden rounded-lg bg-surface">
                  <div
                    className={cn('h-full rounded-lg', s.key === 'paid' ? 'bg-success/70' : 'bg-primary/70')}
                    style={{ width: `${Math.max(s.sessions > 0 ? 2 : 0, (s.sessions / top) * 100)}%` }}
                  />
                  <span className="absolute inset-y-0 left-3 flex items-center text-caption font-semibold text-text-primary">
                    {s.label}
                    {s.fromDatabase && <span className="ml-1 font-normal text-text-secondary">(from bookings)</span>}
                  </span>
                </div>
                <span className="w-14 text-right font-semibold tabular-nums text-text-primary">{fmt(s.sessions)}</span>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

type PageTab = 'pages' | 'sections' | 'landings';
type PageSort = 'views' | 'avgSecs' | 'exitRate';

function PagesTable({ rows, sort }: { rows: ConversionPageRow[]; sort: PageSort }) {
  const sorted = useMemo(() => [...rows].sort((a, b) => (b[sort] ?? -1) - (a[sort] ?? -1)), [rows, sort]);
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-full min-w-[640px] text-left text-caption">
        <thead className="border-b border-border text-text-secondary">
          <tr>
            <th className="px-3 py-2 font-semibold">Page</th>
            <th className="px-3 py-2 text-right font-semibold">Views</th>
            <th className="px-3 py-2 text-right font-semibold">Avg time</th>
            <th className="px-3 py-2 text-right font-semibold">Median</th>
            <th className="px-3 py-2 text-right font-semibold">Scrolled</th>
            <th className="px-3 py-2 text-right font-semibold">Left here</th>
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {sorted.map((r) => (
            <tr key={r.path} className="border-b border-border/60 last:border-0">
              <td className="max-w-[320px] truncate px-3 py-2 font-data text-text-primary" title={r.path}>{r.path || '/'}</td>
              <td className="px-3 py-2 text-right">{fmt(r.views)}</td>
              <td className="px-3 py-2 text-right">{secs(r.avgSecs)}</td>
              <td className="px-3 py-2 text-right">{secs(r.medianSecs)}</td>
              <td className="px-3 py-2 text-right">{pct(r.avgScroll)}</td>
              <td className={cn('px-3 py-2 text-right', (r.exitRate ?? 0) >= 60 && r.views >= 20 && 'font-semibold text-error')}>
                {fmt(r.exits)} · {pct(r.exitRate)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Report({ r }: { r: ConversionReport }) {
  const [tab, setTab] = useState<PageTab>('pages');
  const [sort, setSort] = useState<PageSort>('views');
  return (
    <div className="flex flex-col gap-8">
      <p className="text-body text-text-secondary">
        <span className="font-semibold text-text-primary">{fmt(r.sessions)}</span> real visits in the last {r.days} days.
        {r.instantBounces > 0 && <> {fmt(r.instantBounces)} more were one page and gone within a second (bots and link scanners), left out of everything here.</>}
      </p>

      <Section title="Fix these first" hint="The biggest leaks, worked out from the numbers below. Biggest first.">
        {r.leaks.length === 0 ? (
          <p className="text-body text-text-secondary">Not enough visits in this range to point at a leak yet.</p>
        ) : (
          <ol className="flex flex-col divide-y divide-border rounded-xl border border-border bg-card">
            {r.leaks.map((l) => (
              <li key={l.title} className="flex gap-3 p-4">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
                <div className="min-w-0">
                  <p className="text-body font-semibold text-text-primary">{l.title}</p>
                  <p className="mt-0.5 text-caption text-text-secondary">{l.detail}</p>
                </div>
                <span className="ml-auto shrink-0 self-start rounded-full bg-surface px-2 py-0.5 text-caption text-text-secondary">{l.area}</span>
              </li>
            ))}
          </ol>
        )}
      </Section>

      <Section
        title="Where people stop"
        hint="Each step counts visits that reached it. Paid comes from real bookings in the database. A logged-in player skips sign-in, so it is not a step."
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <Funnel title="Booking a café" steps={r.bookingFunnel} />
          <Funnel title="GTA 6 launch drop" steps={r.dropFunnel} />
        </div>
        <p className="text-caption text-text-secondary">
          Sign-in sheet shown in {fmt(r.loginAsked)} visits. Payment failed or was closed in {fmt(r.paymentProblems)}.
        </p>
      </Section>

      <Section title="Where people come from" hint="From the tagged link, else the site that sent them. “Not recorded” is older visits from before we saved the sender.">
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full min-w-[600px] text-left text-caption">
            <thead className="border-b border-border text-text-secondary">
              <tr>
                <th className="px-3 py-2 font-semibold">From</th>
                <th className="px-3 py-2 text-right font-semibold">Visits</th>
                <th className="px-3 py-2 text-right font-semibold">Left at once</th>
                <th className="px-3 py-2 text-right font-semibold">Saw a café</th>
                <th className="px-3 py-2 text-right font-semibold">Started booking</th>
                <th className="px-3 py-2 text-right font-semibold">Opened payment</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {r.channels.map((c) => (
                <tr key={c.channel} className="border-b border-border/60 last:border-0">
                  <td className="px-3 py-2 font-semibold text-text-primary">{c.channel}</td>
                  <td className="px-3 py-2 text-right">{fmt(c.sessions)}</td>
                  <td className="px-3 py-2 text-right">{pct(c.bounceRate)}</td>
                  <td className="px-3 py-2 text-right">{fmt(c.cafe)}</td>
                  <td className="px-3 py-2 text-right">{fmt(c.start)} · {pct(c.startRate)}</td>
                  <td className="px-3 py-2 text-right">{fmt(c.pay)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Pages: where people spend time and where they leave" hint="Time counts only while the page is on screen. “Left here” is how many visits ended on that page.">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex rounded-xl border border-border bg-surface p-1" role="tablist" aria-label="Page view">
            {([['pages', 'Every page'], ['sections', 'By section'], ['landings', 'First page of a visit']] as [PageTab, string][]).map(([k, label]) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={tab === k}
                onClick={() => setTab(k)}
                className={cn('min-h-[36px] rounded-lg px-3 text-caption font-semibold', tab === k ? 'bg-card text-text-primary shadow-sm' : 'text-text-secondary hover:text-text-primary')}
              >
                {label}
              </button>
            ))}
          </div>
          {tab !== 'landings' && (
            <label className="flex items-center gap-2 text-caption text-text-secondary">
              Sort by
              <select value={sort} onChange={(e) => setSort(e.target.value as PageSort)} className="h-9 rounded-lg border border-border bg-card px-2 text-caption text-text-primary">
                <option value="views">Most viewed</option>
                <option value="avgSecs">Longest time</option>
                <option value="exitRate">Most left</option>
              </select>
            </label>
          )}
        </div>
        {tab === 'pages' && <PagesTable rows={r.pages} sort={sort} />}
        {tab === 'sections' && <PagesTable rows={r.sections} sort={sort} />}
        {tab === 'landings' && (
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full min-w-[520px] text-left text-caption">
              <thead className="border-b border-border text-text-secondary">
                <tr>
                  <th className="px-3 py-2 font-semibold">First page</th>
                  <th className="px-3 py-2 text-right font-semibold">Visits</th>
                  <th className="px-3 py-2 text-right font-semibold">Left within 10s, one page</th>
                  <th className="px-3 py-2 text-right font-semibold">Started booking</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {r.landings.map((l) => (
                  <tr key={l.path} className="border-b border-border/60 last:border-0">
                    <td className="max-w-[320px] truncate px-3 py-2 font-data text-text-primary" title={l.path}>{l.path || '/'}</td>
                    <td className="px-3 py-2 text-right">{fmt(l.sessions)}</td>
                    <td className={cn('px-3 py-2 text-right', (l.bounceRate ?? 0) >= 60 && l.sessions >= 20 && 'font-semibold text-error')}>{fmt(l.bounced)} · {pct(l.bounceRate)}</td>
                    <td className="px-3 py-2 text-right">{fmt(l.start)} · {pct(l.startRate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section title="What people search for" hint={`${fmt(r.searches.total)} searches, ${fmt(r.searches.typed)} with typed words. Letters typed in one go (“G”, “Gt”, “Gta 6”) count once.`}>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="mb-2 text-body font-semibold text-text-primary">Most searched</h3>
            {r.searches.top.length === 0 ? (
              <p className="text-caption text-text-secondary">No typed searches yet.</p>
            ) : (
              <ul className="flex flex-col">
                {r.searches.top.map((s) => (
                  <li key={s.query} className="flex justify-between border-b border-border/60 py-1.5 text-caption last:border-0">
                    <span className="truncate text-text-primary">{s.query}</span>
                    <span className="tabular-nums text-text-secondary">{fmt(s.times)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="mb-2 text-body font-semibold text-text-primary">Found nothing</h3>
            {r.searches.zeroResults.length === 0 ? (
              <p className="text-caption text-text-secondary">Every search found something.</p>
            ) : (
              <ul className="flex flex-col">
                {r.searches.zeroResults.map((s) => (
                  <li key={s.query} className="flex justify-between gap-3 border-b border-border/60 py-1.5 text-caption last:border-0">
                    <span className="truncate text-text-primary">{s.query}</span>
                    <span className="shrink-0 text-text-secondary">
                      {s.cities.length > 0 && `${s.cities.join(', ')} · `}
                      <span className="tabular-nums">{fmt(s.times)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </Section>

      <Section
        title="What people tap"
        hint={`Buttons and pop-ups, by visits that tapped them. ${fmt(r.invitedVisits)} visits came from a friend's invite link.`}
      >
        {r.actions.length === 0 ? (
          <p className="text-body text-text-secondary">No taps recorded in this range.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full min-w-[420px] text-left text-caption">
              <thead className="border-b border-border text-text-secondary">
                <tr>
                  <th className="px-3 py-2 font-semibold">Tap · where</th>
                  <th className="px-3 py-2 text-right font-semibold">Visits</th>
                  <th className="px-3 py-2 text-right font-semibold">Times</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {r.actions.map((a) => (
                  <tr key={a.action} className="border-b border-border/60 last:border-0">
                    <td className="max-w-[360px] truncate px-3 py-2 font-data text-text-primary" title={a.action}>{a.action.replace(/_/g, ' ')}</td>
                    <td className="px-3 py-2 text-right">{fmt(a.sessions)}</td>
                    <td className="px-3 py-2 text-right">{fmt(a.times)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section title="Opened payment, never paid" hint="Real people who got to the last step. Call or WhatsApp them from the booking.">
        {r.unpaid.length === 0 ? (
          <p className="text-body text-text-secondary">Nobody in this range.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full min-w-[600px] text-left text-caption">
              <thead className="border-b border-border text-text-secondary">
                <tr>
                  <th className="px-3 py-2 font-semibold">When</th>
                  <th className="px-3 py-2 font-semibold">Café / drop</th>
                  <th className="px-3 py-2 font-semibold">Reference</th>
                  <th className="px-3 py-2 text-right font-semibold">Amount</th>
                  <th className="px-3 py-2 font-semibold">Why</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {r.unpaid.map((u) => (
                  <tr key={u.reference} className="border-b border-border/60 last:border-0">
                    <td className="whitespace-nowrap px-3 py-2">{u.at ? new Date(u.at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '–'}</td>
                    <td className="px-3 py-2 text-text-primary">{u.cafe}</td>
                    <td className="px-3 py-2">
                      <Link href={`/admin/bookings?q=${encodeURIComponent(u.reference)}`} className="font-data text-primary underline-offset-2 hover:underline">
                        {u.reference}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-right">₹{fmt(Math.round(u.amount))}</td>
                    <td className="px-3 py-2 text-text-secondary">{u.reason || 'Closed the payment screen or the UPI app'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section title="Phones, computers and app browsers" hint="Instagram and Facebook open links in their own browser, where UPI apps often fail to open.">
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full min-w-[480px] text-left text-caption">
            <thead className="border-b border-border text-text-secondary">
              <tr>
                <th className="px-3 py-2 font-semibold">Device</th>
                <th className="px-3 py-2 text-right font-semibold">Visits</th>
                <th className="px-3 py-2 text-right font-semibold">Started booking</th>
                <th className="px-3 py-2 text-right font-semibold">Opened payment</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {r.devices.map((d) => (
                <tr key={d.device} className="border-b border-border/60 last:border-0">
                  <td className="px-3 py-2 capitalize text-text-primary">{d.device}</td>
                  <td className="px-3 py-2 text-right">{fmt(d.sessions)}</td>
                  <td className="px-3 py-2 text-right">{fmt(d.start)}</td>
                  <td className="px-3 py-2 text-right">{fmt(d.pay)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <p className="text-caption text-text-secondary">
        Our own test devices, admin and owner pages are left out. A visit is one browser session; the same person on two
        phones counts twice.
      </p>
    </div>
  );
}

export default function ConversionPage() {
  const [days, setDays] = useState<(typeof RANGES)[number]>(30);
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['admin', 'analytics', 'conversion', days],
    queryFn: () => getConversion(days),
    staleTime: 60_000,
  });

  return (
    <div className="flex flex-col gap-6 pb-12">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-h2 text-text-primary lg:text-h1">Conversion</h1>
          <p className="text-caption text-text-secondary">Why visitors don&apos;t book, and where they stop.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-xl border border-border bg-surface p-1" role="tablist" aria-label="Date range">
            {RANGES.map((d) => (
              <button
                key={d}
                type="button"
                role="tab"
                aria-selected={days === d}
                onClick={() => setDays(d)}
                className={cn('min-h-[36px] rounded-lg px-3 text-caption font-semibold', days === d ? 'bg-card text-text-primary shadow-sm' : 'text-text-secondary hover:text-text-primary')}
              >
                {d} days
              </button>
            ))}
          </div>
          <Button variant="ghost" size="sm" onClick={() => refetch()} aria-label="Refresh" disabled={isFetching}>
            <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />
          </Button>
        </div>
      </div>
      {isLoading && <SkeletonCard />}
      {isError && <ErrorState title="Couldn't load the report" message="Try again in a moment." onRetry={() => refetch()} />}
      {data && <Report r={data} />}
    </div>
  );
}
