'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight } from 'lucide-react';
import { getCommunityAnalytics, type CommunityAnalytics } from '@/lib/api/admin';
import { cn } from '@/lib/cn';
import { Panel } from './ui';

const RANGES = [7, 30, 90] as const;
const TAB_NAMES: Record<string, string> = { week: 'This week', vote: 'Vote', next: 'Next up', photos: 'Photos' };
const WHERE_NAMES: Record<string, string> = {
  community_page_top: 'Community page, top button',
  community_page_sticky: 'Community page, bottom button',
  community_page_again: 'Community page, after joining',
  home_tab: 'Home, Community tab',
  home_pill: 'Home, Join pill',
  popup: 'Challenge pop-up',
};

const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : '·');

/** Everything people did on the Community page, from our own tracking. */
export function Overview() {
  const [days, setDays] = useState<(typeof RANGES)[number]>(30);
  const { data, isLoading, error } = useQuery({ queryKey: ['admin', 'community-analytics', days], queryFn: () => getCommunityAnalytics(days) });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-caption text-text-secondary">Counted once per visitor. Our own test visits (?internal=1) are left out.</p>
        <div className="flex rounded-xl border border-border bg-surface p-1" role="tablist" aria-label="Period">
          {RANGES.map((d) => (
            <button
              key={d}
              type="button"
              role="tab"
              aria-selected={days === d}
              onClick={() => setDays(d)}
              className={cn('rounded-lg px-3 py-1.5 text-caption font-semibold', days === d ? 'bg-card text-text-primary shadow-sm' : 'text-text-secondary')}
            >
              Last {d} days
            </button>
          ))}
        </div>
      </div>

      {isLoading && <div className="h-40 animate-pulse rounded-2xl bg-surface" />}
      {error && <p className="text-caption text-error">Could not load the numbers. {(error as Error).message}</p>}
      {data && <Numbers a={data} />}
    </div>
  );
}

function Numbers({ a }: { a: CommunityAnalytics }) {
  const t = a.totals;
  const steps = [
    { label: 'Opened the page', n: t.visits, of: null as number | null },
    { label: 'Tapped Join', n: t.joined, of: t.visits },
    { label: 'Voted', n: t.voted, of: t.visits },
    { label: 'Left email / number', n: t.leftContact, of: t.visits },
  ];
  const tabTotal = Object.values(a.tabs).reduce((x, y) => x + y, 0);
  const whereTotal = Object.values(a.joinWhere).reduce((x, y) => x + y, 0);
  return (
    <>
      <Panel title="The funnel" hint="From opening the page to joining. The % is out of everyone who opened it.">
        <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((s, i) => (
            <li key={s.label} className="flex items-center gap-2">
              <div className="flex-1 rounded-xl bg-surface px-3 py-2.5">
                <p className="font-heading text-h2 font-bold tabular-nums text-text-primary">{s.n}</p>
                <p className="text-caption text-text-secondary">
                  {s.label}
                  {s.of !== null && <b className="ml-1 text-text-primary">{pct(s.n, s.of)}</b>}
                </p>
              </div>
              {i < steps.length - 1 && <ArrowRight className="hidden h-4 w-4 flex-shrink-0 text-text-secondary lg:block" aria-hidden />}
            </li>
          ))}
        </ol>
        <p className="text-caption text-text-secondary">
          Opened inside Instagram: <b className="text-text-primary">{t.inApp}</b> · Suggested a café or photos: <b className="text-text-primary">{t.suggested}</b> · Asked to sign in to vote/send:{' '}
          <b className="text-text-primary">{t.askedToSignIn}</b> · Took a vote back: <b className="text-text-primary">{t.removedVote}</b> · Tapped a &quot;next step&quot; card: <b className="text-text-primary">{t.nextStepTaps}</b>
        </p>
      </Panel>

      <Panel title="Day by day" hint="Bars are visitors; the green part is how many of them tapped Join. Dates are India time.">
        <DailyChart series={a.series} />
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Which tab they open" hint="Taps on the tabs. The first tab is counted only when someone switches to it.">
          {tabTotal === 0 ? (
            <p className="text-body text-text-secondary">No tab taps yet.</p>
          ) : (
            <Bars rows={Object.entries(a.tabs).sort((x, y) => y[1] - x[1]).map(([k, v]) => [TAB_NAMES[k] ?? k, v])} total={tabTotal} />
          )}
        </Panel>
        <Panel title="Which Join button they used" hint="Every Join tap on the site, by where the button was.">
          {whereTotal === 0 ? (
            <p className="text-body text-text-secondary">No Join taps yet.</p>
          ) : (
            <Bars rows={Object.entries(a.joinWhere).map(([k, v]) => [WHERE_NAMES[k] ?? k.replace(/_/g, ' '), v])} total={whereTotal} />
          )}
        </Panel>
      </div>

      <Panel title="Which ad or link brought them" hint="Per link (the campaign name in the link). Different visitors at each step.">
        {a.sources.length === 0 ? (
          <p className="text-body text-text-secondary">No visits yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-caption tabular-nums">
              <thead className="text-text-secondary">
                <tr>{['Ad / link', 'Opened', 'In Instagram', 'Tapped Join', 'Voted', 'Suggested', 'Left contact'].map((h) => <th key={h} className="py-1.5 pr-3 font-bold">{h}</th>)}</tr>
              </thead>
              <tbody>
                {a.sources.map((f) => (
                  <tr key={f.source} className="border-t border-border/60">
                    <td className="py-2 pr-3 font-bold text-text-primary">{f.source === 'direct' ? 'No link (typed / shared)' : f.source}</td>
                    <td className="pr-3">{f.community_landed}</td>
                    <td className="pr-3">{f.inApp}</td>
                    <td className="pr-3">{f.community_join_tap} <span className="text-text-secondary">({pct(f.community_join_tap, f.community_landed)})</span></td>
                    <td className="pr-3">{f.community_poll_vote}</td>
                    <td className="pr-3">{f.community_contribution}</td>
                    <td className="pr-3">{f.community_lead}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}

function Bars({ rows, total }: { rows: [string, number][]; total: number }) {
  return (
    <ul className="flex flex-col gap-1.5">
      {rows.map(([name, n]) => (
        <li key={name} className="relative overflow-hidden rounded-lg border border-border px-3 py-2 text-caption">
          <span className="absolute inset-y-0 left-0 bg-primary/10" style={{ width: `${(n / total) * 100}%` }} aria-hidden />
          <span className="relative flex justify-between gap-3">
            <span className="font-semibold text-text-primary">{name}</span>
            <span className="tabular-nums">{n} · {pct(n, total)}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function DailyChart({ series }: { series: CommunityAnalytics['series'] }) {
  const max = Math.max(1, ...series.map((s) => s.visits));
  const label = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  const every = Math.ceil(series.length / 8);
  if (series.every((s) => s.visits === 0 && s.joins === 0)) return <p className="text-body text-text-secondary">No visits in this period.</p>;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex h-40 items-end gap-[3px]" role="img" aria-label="Visitors and Join taps per day">
        {series.map((s) => (
          <div key={s.day} className="group relative flex h-full flex-1 flex-col justify-end" title={`${label(s.day)}: ${s.visits} visitors, ${s.joins} joined, ${s.votes} voted`}>
            <div className="relative w-full rounded-t-sm bg-primary/25" style={{ height: `${(s.visits / max) * 100}%` }}>
              <div className="absolute inset-x-0 bottom-0 rounded-t-sm bg-success" style={{ height: s.visits ? `${(Math.min(s.joins, s.visits) / s.visits) * 100}%` : 0 }} />
            </div>
          </div>
        ))}
      </div>
      <div className="flex gap-[3px] text-[10px] text-text-secondary">
        {series.map((s, i) => (
          <span key={s.day} className="flex-1 truncate text-center">{i % every === 0 ? label(s.day) : ''}</span>
        ))}
      </div>
      <p className="text-caption text-text-secondary">Busiest day: {(() => { const b = [...series].sort((x, y) => y.visits - x.visits)[0]; return `${label(b.day)} with ${b.visits} visitors and ${b.joins} Join taps`; })()}.</p>
    </div>
  );
}
