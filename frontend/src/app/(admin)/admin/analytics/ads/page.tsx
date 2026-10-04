'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Check, CheckCircle2, Copy, Eye, Info, Plus, QrCode, Target, X, type LucideIcon } from 'lucide-react';
import { getAdCampaignReport, type AdCampaignReport, type AdviceTone, type NamedCount } from '@/lib/api/adminAnalytics';
import {
  CHANNEL_LABELS,
  createMarketingCampaign,
  listMarketingCampaigns,
  updateMarketingCampaign,
  type CampaignChannel,
  type CampaignStatus,
  type MarketingCampaign,
} from '@/lib/api/marketingCampaigns';
import { SkeletonCard } from '@/components/ui';
import { formatCurrency } from '@/lib/format';
import { cn } from '@/lib/cn';

const isoDay = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
const pct = (n: number) => `${Math.round(n * 100)}%`;
const rupees = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
const LABELS: Record<string, string> = {
  mobile: 'Mobile',
  desktop: 'Desktop',
  tablet: 'Tablet',
  unknown: 'Unknown',
  instagram: 'Instagram app',
  facebook: 'Facebook app',
  browser: 'Regular browser',
  new: 'New visitors',
  returning: 'Seen before',
};
const STATUS_TABS: { key: CampaignStatus; label: string }[] = [
  { key: 'live', label: 'Live' },
  { key: 'ended', label: 'Ended' },
  { key: 'archived', label: 'Archived' },
];

function useCopy() {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      setTimeout(() => setCopied(null), 2000);
    } catch {}
  };
  return { copied, copy };
}

function slugify(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

function StatusChip({ status }: { status: CampaignStatus }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[12px] font-bold',
        status === 'live' && 'bg-success/15 text-success',
        status === 'ended' && 'bg-surface text-text-secondary',
        status === 'archived' && 'bg-surface text-text-tertiary',
      )}
    >
      {status === 'live' && <span className="h-1.5 w-1.5 rounded-full bg-success" />}
      {status === 'live' ? 'Live' : status === 'ended' ? 'Ended' : 'Archived'}
    </span>
  );
}

function Bars({ title, rows }: { title: string; rows: NamedCount[] }) {
  const total = rows.reduce((s, r) => s + r.sessions, 0);
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
      <h3 className="font-heading text-body-emphasis text-text-primary">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-caption text-text-secondary">No data yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.slice(0, 8).map((r) => (
            <li key={r.name} className="flex flex-col gap-1">
              <div className="flex justify-between text-caption">
                <span className="text-text-primary">{LABELS[r.name] ?? r.name}</span>
                <span className="tabular-nums text-text-secondary">
                  {r.sessions} · {total ? pct(r.sessions / total) : '0%'}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-surface">
                <div className="h-full rounded-full bg-secondary" style={{ width: `${total ? (r.sessions / total) * 100 : 0}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** The whole campaign in one plain sentence. */
function storyLine(r: AdCampaignReport, spend: number | null): string {
  const t = r.totals;
  if (t.visitors === 0) return 'Nobody has tapped this link yet. Numbers show up here as soon as someone does.';
  const parts = [`This link brought ${t.visitors} ${t.visitors === 1 ? 'person' : 'people'} to KHEL-O.`];
  parts.push(`${t.viewedCafe} looked at a café`);
  if (t.notifyMe) parts[1] += `, ${t.notifyMe} voted for a café`;
  parts[1] += t.booked
    ? ` and ${t.booked} booked, paying ${rupees(t.gmv)}.`
    : t.bookingStarted
    ? `, ${t.bookingStarted} started a booking but nobody has paid yet.`
    : ', nobody has booked yet.';
  if (spend && t.booked) parts.push(`You spent ${rupees(spend)}, so each booking cost you ${rupees(spend / t.booked)}.`);
  else if (spend) parts.push(`You spent ${rupees(spend)}, ${rupees(spend / t.visitors)} per person who tapped.`);
  return parts.join(' ');
}

function pitchLine(r: AdCampaignReport, spend: number | null): string {
  const t = r.totals;
  const lead = spend ? `We spent ₹${spend.toLocaleString('en-IN')} promoting KHEL-O on Instagram and` : 'Our Instagram campaign';
  const parts = [`${t.viewedCafe} opened a café page`];
  if (t.notifyMe) parts.push(`${t.notifyMe} tapped “Notify me” for cafés not yet on KHEL-O`);
  if (t.bookingStarted) parts.push(`${t.bookingStarted} started a booking`);
  if (t.booked) parts.push(`${t.booked} booked (${formatCurrency(t.gmv)} in sessions)`);
  return `${lead} brought ${t.visitors} real visitors to the platform. ${parts.join(', ')}.`;
}

/** The funnel with the step that loses the most people called out. */
function DropOff({ report }: { report: AdCampaignReport }) {
  const steps = report.funnel;
  const landed = steps[0]?.sessions ?? 0;
  let worst: { label: string; lost: number; from: number } | null = null;
  for (let i = 1; i < steps.length; i++) {
    const lost = steps[i - 1].sessions - steps[i].sessions;
    if (lost > 0 && (!worst || lost > worst.lost)) worst = { label: steps[i].label, lost, from: steps[i - 1].sessions };
  }
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
      <h2 className="font-heading text-h3 text-text-primary">Where people dropped off</h2>
      <ol className="flex flex-col gap-2.5">
        {steps.map((s, i) => (
          <li key={s.key} className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)_3rem] items-center gap-3 text-caption">
            <span className="text-text-primary">{s.label}</span>
            <div className="h-2.5 overflow-hidden rounded-full bg-surface" aria-hidden>
              <div
                className={cn('h-full rounded-full', i === steps.length - 1 ? 'bg-primary' : 'bg-secondary')}
                style={{ width: `${landed ? Math.max(1.5, (s.sessions / landed) * 100) : 0}%` }}
              />
            </div>
            <span className="text-right font-data font-bold tabular-nums text-text-primary">{s.sessions}</span>
          </li>
        ))}
      </ol>
      {worst && (
        <p className="rounded-lg bg-warning/10 px-3 py-2 text-caption text-text-primary">
          <strong>Most people stopped before “{worst.label}”:</strong> {worst.lost} of {worst.from}{' '}
          ({pct(worst.lost / worst.from)}) never got that far. Fixing this step helps the most.
        </p>
      )}
    </section>
  );
}

function CheckoutLosses({ report }: { report: AdCampaignReport }) {
  const c = report.checkout;
  if (!c || c.bookingStarted === 0) return null;
  const rows = [
    { label: 'Picked a slot and tapped Book', n: c.bookingStarted, note: 'Started checking out', bad: false, good: false },
    { label: 'Asked to log in or sign up', n: c.loginShown, note: 'Weren’t logged in yet when they tried to pay' },
    { label: 'Reached the payment screen', n: c.paymentOpened, note: 'Saw the UPI / card options' },
    { label: 'Payment failed', n: c.paymentFailed, note: 'Card declined, UPI timed out, etc.', bad: true },
    { label: 'Closed payment without paying', n: c.paymentDismissed, note: 'Changed their mind at the last step', bad: true },
    { label: 'Paid and booked', n: c.completed, note: 'Money received', good: true },
  ];
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
      <div>
        <h2 className="font-heading text-h3 text-text-primary">Checkout, step by step</h2>
        <p className="text-caption text-text-secondary">People from this link, after they tapped Book.</p>
      </div>
      <ul className="flex flex-col divide-y divide-border">
        {rows.map((r) => (
          <li key={r.label} className="flex items-center justify-between gap-3 py-2">
            <div className="min-w-0">
              <div className="text-body text-text-primary">{r.label}</div>
              <div className="text-caption text-text-secondary">{r.note}</div>
            </div>
            <span
              className={cn(
                'font-data text-h3 font-bold tabular-nums',
                r.bad && r.n > 0 ? 'text-warning' : r.good ? 'text-success' : 'text-text-primary',
              )}
            >
              {r.n}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

const TONE: Record<AdviceTone, { icon: LucideIcon; label: string; chip: string; tint: string }> = {
  fix: { icon: AlertTriangle, label: 'Fix now', chip: 'bg-error/10 text-error', tint: 'bg-error/5' },
  watch: { icon: Eye, label: 'Watch', chip: 'bg-warning/15 text-amber-800', tint: 'bg-warning/10' },
  good: { icon: CheckCircle2, label: 'Working', chip: 'bg-success/10 text-success', tint: 'bg-success/5' },
  info: { icon: Info, label: 'Good to know', chip: 'bg-surface text-text-secondary', tint: 'bg-surface' },
};

/** "What to do next": the server reads the numbers and says where people are lost and what to change. */
function NextSteps({ report }: { report: AdCampaignReport }) {
  const advice = report.advice;
  if (!advice || advice.steps.length === 0) return null;
  const [first, ...rest] = advice.steps;
  const FirstIcon = TONE[first.tone].icon;
  return (
    <section aria-labelledby="next-steps-title" className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 md:p-5">
      <div className="flex flex-col gap-1">
        <span className="text-overline text-text-secondary">What to do next</span>
        <h2 id="next-steps-title" className="font-heading text-h3 text-text-primary text-balance">
          {advice.headline}
        </h2>
      </div>

      <div className={cn('flex flex-col gap-2 rounded-xl p-4', TONE[first.tone].tint)}>
        <span className={cn('inline-flex w-fit items-center gap-1.5 rounded-full px-2 py-0.5 text-caption font-semibold', TONE[first.tone].chip)}>
          <FirstIcon className="h-3.5 w-3.5" aria-hidden />
          {first.tone === 'fix' ? 'Fix this first' : TONE[first.tone].label}
        </span>
        <p className="font-heading text-body-emphasis text-text-primary">{first.title}</p>
        <p className="text-body text-text-secondary">{first.detail}</p>
        <p className="text-body text-text-primary">
          <strong>Do this:</strong> {first.todo}
        </p>
      </div>

      {rest.length > 0 && (
        <ol className="flex flex-col divide-y divide-border">
          {rest.map((s) => {
            const Icon = TONE[s.tone].icon;
            return (
              <li key={s.key} className="flex gap-3 py-3">
                <span className={cn('mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full', TONE[s.tone].chip)} title={TONE[s.tone].label}>
                  <Icon className="h-4 w-4" aria-hidden />
                  <span className="sr-only">{TONE[s.tone].label}:</span>
                </span>
                <div className="flex min-w-0 flex-col gap-0.5">
                  <p className="font-semibold text-body text-text-primary">{s.title}</p>
                  <p className="text-caption text-text-secondary">{s.detail}</p>
                  <p className="text-caption text-text-primary">
                    <span className="font-semibold">Do this:</span> {s.todo}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
      <p className="text-caption text-text-secondary">Worked out from the numbers for the dates above. It changes as new visits come in.</p>
    </section>
  );
}

const ACTION_LABELS: [string, string][] = [
  ['campaign_popup_shown', 'Saw the welcome pop-up'],
  ['campaign_popup_book_cafe', 'Tapped Book on a café in the pop-up'],
  ['campaign_strip_book_cafe', 'Tapped Book on a café at the top of the home page'],
  ['campaign_strip_see_prices', 'Tapped “See every special price” on the home page'],
  ['campaign_popup_sign_in', 'Tapped “Sign in to claim” (old pop-up)'],
  ['campaign_badge_claimed', 'Claimed the badge'],
  ['campaign_popup_see_prices', 'Tapped “See every special price” in the pop-up'],
  ['campaign_popup_start_booking', 'Tapped “Start booking” (old pop-up)'],
  ['campaign_popup_close', 'Closed the pop-up'],
  ['campaign_prices_sign_in', 'Signed in from the prices page'],
  ['campaign_book_now', 'Tapped “Book now” on a café'],
  ['campaign_share_open', 'Opened “Share with friends”'],
  ['directions_click', 'Tapped Directions'],
];

const secsLabel = (s: number) => (s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`);

/** Taps and time on site, in plain words. */
function WhatTheyDid({ report }: { report: AdCampaignReport }) {
  const a = report.actions ?? {};
  const e = report.engagement;
  const known = new Set(ACTION_LABELS.map(([k]) => k));
  const rows = [
    ...ACTION_LABELS.filter(([k]) => a[k]).map(([k, label]) => ({ key: k, label, n: a[k] })),
    ...Object.entries(a)
      .filter(([k]) => !known.has(k))
      .map(([k, n]) => ({ key: k, label: k.replace(/_/g, ' '), n })),
  ];
  if (rows.length === 0 && !e?.measured) return null;
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
      <h2 className="font-heading text-h3 text-text-primary">What people did</h2>
      {e && e.measured > 0 && (
        <p className="text-body text-text-primary">
          Half stayed longer than <strong>{secsLabel(e.medianSecs)}</strong> and scrolled at least{' '}
          <strong>{e.medianScroll}%</strong> down. {e.stayed10s} stayed 10 seconds or more; {e.bounced} left within 10
          seconds without opening another page.
        </p>
      )}
      {rows.length > 0 && (
        <ul className="flex flex-col divide-y divide-border">
          {rows.map((r) => (
            <li key={r.key} className="flex items-center justify-between gap-3 py-2 text-body">
              <span className="text-text-primary">{r.label}</span>
              <span className="font-data font-bold tabular-nums text-text-primary">{r.n}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="text-caption text-text-secondary">Each person is counted once per tap, however many times they tapped.</p>
    </section>
  );
}

function DayByDay({ report }: { report: AdCampaignReport }) {
  const days = report.daily;
  if (days.length === 0) return null;
  const max = Math.max(...days.map((d) => d.sessions), 1);
  const best = days.reduce((a, b) => (b.sessions > a.sessions ? b : a));
  const label = (iso: string) =>
    new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
      <h2 className="font-heading text-h3 text-text-primary">Day by day</h2>
      <div className="flex h-36 items-end gap-1.5 overflow-x-auto pb-1">
        {days.map((d) => (
          <div key={d.date} className="flex min-w-[2.25rem] flex-1 flex-col items-center gap-1">
            <span className="font-data text-[11px] tabular-nums text-text-secondary">{d.sessions}</span>
            <div
              className={cn('w-full rounded-md', d.date === best.date ? 'bg-primary' : 'bg-border')}
              style={{ height: `${Math.max(4, (d.sessions / max) * 96)}px` }}
            />
            <span className="whitespace-nowrap text-[10px] text-text-secondary">{label(d.date)}</span>
          </div>
        ))}
      </div>
      <p className="text-caption text-text-secondary">
        Best day: {label(best.date)} with {best.sessions} {best.sessions === 1 ? 'person' : 'people'}.
      </p>
    </section>
  );
}

function NewCampaignForm({ onDone }: { onDone: (c: MarketingCampaign) => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [channel, setChannel] = useState<CampaignChannel>('instagram_reel');
  const [paid, setPaid] = useState(true);
  const [landingPath, setLandingPath] = useState('/');
  const [spend, setSpend] = useState('');
  const [startedOn, setStartedOn] = useState(isoDay(new Date()));
  const effectiveSlug = slugTouched ? slug : slugify(name);
  const canPay = channel === 'instagram_reel' || channel === 'instagram_story' || channel === 'other';

  const create = useMutation({
    mutationFn: () =>
      createMarketingCampaign({
        name,
        slug: effectiveSlug,
        channel,
        paid: canPay && paid,
        landingPath,
        spendInr: Number(spend) > 0 ? Number(spend) : null,
        startedOn,
      }),
    onSuccess: ({ campaign }) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'marketing-campaigns'] });
      onDone(campaign);
    },
  });
  const err = (create.error as { response?: { data?: { error?: { message?: string } } } } | null)?.response?.data?.error
    ?.message;

  const input = 'min-h-input w-full rounded-lg border border-border bg-card px-3 text-body font-normal text-text-primary';
  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-4 md:p-5">
      <h2 className="font-heading text-h3 text-text-primary">New campaign</h2>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className="flex flex-col gap-1 text-caption font-semibold text-text-primary">
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="KHELO Special Access" maxLength={120} className={input} />
        </label>
        <label className="flex flex-col gap-1 text-caption font-semibold text-text-primary">
          Short link
          <div className="flex min-h-input items-center rounded-lg border border-border bg-card pl-3 text-body font-normal">
            <span className="text-text-secondary">khel-o.com/c/</span>
            <input
              value={effectiveSlug}
              onChange={(e) => {
                setSlugTouched(true);
                setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''));
              }}
              maxLength={40}
              className="min-w-0 flex-1 bg-transparent py-2 pr-3 text-text-primary outline-none"
              aria-label="Short link ending"
            />
          </div>
        </label>
        <label className="flex flex-col gap-1 text-caption font-semibold text-text-primary">
          Where you&apos;ll post it
          <select value={channel} onChange={(e) => setChannel(e.target.value as CampaignChannel)} className={input}>
            {(Object.keys(CHANNEL_LABELS) as CampaignChannel[]).map((k) => (
              <option key={k} value={k}>
                {CHANNEL_LABELS[k]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-caption font-semibold text-text-primary">
          Opens this page
          <input value={landingPath} onChange={(e) => setLandingPath(e.target.value)} placeholder="/" className={input} />
          <span className="font-normal text-text-secondary">“/” is the homepage. For an offer pop-up use /?campaign=CODE.</span>
        </label>
        <label className="flex flex-col gap-1 text-caption font-semibold text-text-primary">
          Spent (₹), optional
          <input type="number" min={0} inputMode="numeric" value={spend} onChange={(e) => setSpend(e.target.value)} placeholder="1000" className={input} />
        </label>
        <label className="flex flex-col gap-1 text-caption font-semibold text-text-primary">
          Starts
          <input type="date" value={startedOn} onChange={(e) => setStartedOn(e.target.value)} className={input} />
        </label>
      </div>
      {canPay && (
        <label className="flex min-h-[44px] items-center gap-2 text-body text-text-primary">
          <input type="checkbox" checked={paid} onChange={(e) => setPaid(e.target.checked)} className="h-4 w-4 accent-primary" />
          This is a paid boost
        </label>
      )}
      {err && <p className="text-caption text-error">{err}</p>}
      <button
        type="button"
        disabled={name.trim().length < 2 || effectiveSlug.length < 2 || create.isPending}
        onClick={() => create.mutate()}
        className="min-h-[44px] w-fit rounded-xl bg-primary px-5 font-semibold text-white disabled:opacity-50"
      >
        {create.isPending ? 'Creating…' : 'Create link'}
      </button>
    </section>
  );
}

type Period = 'start' | 'today' | 'week' | 'custom';
const PERIODS: { key: Period; label: string }[] = [
  { key: 'start', label: 'Since it started' },
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'Last 7 days' },
  { key: 'custom', label: 'Pick dates' },
];
interface SavedView {
  period: Period;
  from?: string;
  to?: string;
}

/** Which dates the admin last chose to look at, per campaign, on this device. */
function readView(id: string): SavedView {
  try {
    const v = JSON.parse(localStorage.getItem(`khelo.campaignView.${id}`) ?? 'null');
    if (v && PERIODS.some((p) => p.key === v.period)) return v;
  } catch {}
  return { period: 'start' };
}
function writeView(id: string, v: SavedView) {
  try {
    localStorage.setItem(`khelo.campaignView.${id}`, JSON.stringify(v));
  } catch {}
}

const shortDay = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

function CampaignDetail({ campaign }: { campaign: MarketingCampaign }) {
  const queryClient = useQueryClient();
  const today = isoDay(new Date());
  const [view, setView] = useState<SavedView>({ period: 'start' });
  const [includeTests, setIncludeTests] = useState(false);
  const [spend, setSpend] = useState(campaign.spendInr?.toString() ?? '');
  const [startedOn, setStartedOn] = useState(campaign.startedOn);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const { copied, copy } = useCopy();

  useEffect(() => {
    setView(readView(campaign.id));
  }, [campaign.id]);
  useEffect(() => {
    setSpend(campaign.spendInr?.toString() ?? '');
    setStartedOn(campaign.startedOn);
  }, [campaign.id, campaign.spendInr, campaign.startedOn]);
  useEffect(() => {
    if (savedAt === null) return;
    const t = setTimeout(() => setSavedAt(null), 4000);
    return () => clearTimeout(t);
  }, [savedAt]);

  const chooseView = (v: SavedView) => {
    setView(v);
    writeView(campaign.id, v);
  };

  // The dates the numbers below cover. "Since it started" follows the saved
  // start date, so changing that date moves this too.
  const start = campaign.reportFrom;
  const weekAgo = isoDay(new Date(Date.now() - 6 * 86_400_000));
  const { from, to } =
    view.period === 'today'
      ? { from: today, to: today }
      : view.period === 'week'
      ? { from: weekAgo > start ? weekAgo : start, to: today }
      : view.period === 'custom'
      ? { from: view.from ?? start, to: view.to ?? today }
      : { from: start, to: campaign.reportTo };
  const showingLine =
    from === to
      ? `Showing ${from === today ? 'today' : shortDay(from)} only`
      : `Showing ${shortDay(from)} – ${to === today ? 'today' : shortDay(to)}`;

  const upcoming = from > to;
  const { data: report, isLoading } = useQuery({
    queryKey: ['admin', 'analytics', 'ad-report', campaign.utmSource, campaign.slug, from, to, includeTests],
    queryFn: () =>
      getAdCampaignReport({ source: campaign.utmSource, campaign: campaign.slug, from, to, includeInternal: includeTests }),
    enabled: !upcoming,
    staleTime: 30_000,
  });

  const update = useMutation({
    mutationFn: (patch: Parameters<typeof updateMarketingCampaign>[1]) => updateMarketingCampaign(campaign.id, patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'marketing-campaigns'] }),
  });
  const saveDetails = useMutation({
    mutationFn: () =>
      updateMarketingCampaign(campaign.id, {
        ...(Number(spend) > 0 ? { spendInr: Number(spend) } : { clearSpend: true }),
        startedOn,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'marketing-campaigns'] });
      setSavedAt(Date.now());
    },
  });
  const detailsChanged =
    spend.trim() !== (campaign.spendInr?.toString() ?? '') || (startedOn !== campaign.startedOn && startedOn !== '');
  const saveError = (saveDetails.error as { response?: { data?: { error?: { message?: string } } } } | null)?.response
    ?.data?.error?.message;

  const spendNum = campaign.spendInr && campaign.spendInr > 0 ? campaign.spendInr : null;
  const t = report?.totals;
  const costPerBooking = spendNum && t?.booked ? rupees(spendNum / t.booked) : '—';

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-4 md:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <StatusChip status={campaign.status} />
              <span className="text-caption text-text-secondary">
                {CHANNEL_LABELS[campaign.channel]}
                {campaign.paid ? ' · Paid boost' : ''} · since{' '}
                {new Date(`${campaign.startedOn}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
              </span>
            </div>
            <h2 className="font-heading text-h2 text-text-primary">{campaign.name}</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            {campaign.status === 'live' && (
              <button type="button" onClick={() => update.mutate({ status: 'ended' })} className="min-h-[40px] rounded-lg border border-border px-3 text-caption font-semibold text-text-primary hover:bg-surface">
                End campaign
              </button>
            )}
            {campaign.status !== 'archived' ? (
              <button type="button" onClick={() => update.mutate({ status: 'archived' })} className="min-h-[40px] rounded-lg border border-border px-3 text-caption font-semibold text-text-secondary hover:bg-surface">
                Archive
              </button>
            ) : (
              <button type="button" onClick={() => update.mutate({ status: 'live' })} className="min-h-[40px] rounded-lg border border-border px-3 text-caption font-semibold text-text-primary hover:bg-surface">
                Restore
              </button>
            )}
          </div>
        </div>

        <ShortLink campaign={campaign} copied={copied} copy={copy} />

        <div className="flex flex-col gap-2 border-t border-border pt-4">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="text-caption font-semibold text-text-secondary">Numbers for</span>
            <div role="radiogroup" aria-label="Which dates to show" className="flex flex-wrap gap-1 rounded-xl bg-surface p-1">
              {PERIODS.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  role="radio"
                  aria-checked={view.period === p.key}
                  onClick={() =>
                    chooseView(p.key === 'custom' ? { period: 'custom', from: view.from ?? from, to: view.to ?? to } : { period: p.key })
                  }
                  className={cn(
                    'min-h-[36px] rounded-lg px-3 text-caption font-semibold transition-colors',
                    view.period === p.key ? 'bg-card text-text-primary shadow-sm' : 'text-text-secondary hover:text-text-primary',
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <label className="flex min-h-[36px] items-center gap-2 text-caption text-text-secondary">
              <input type="checkbox" checked={includeTests} onChange={(e) => setIncludeTests(e.target.checked)} className="h-4 w-4 accent-primary" />
              Include our own test visits
            </label>
          </div>
          {view.period === 'custom' && (
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1 text-caption font-semibold text-text-primary">
                From
                <input
                  type="date"
                  value={from}
                  max={to}
                  onChange={(e) => e.target.value && chooseView({ period: 'custom', from: e.target.value, to })}
                  className="min-h-input rounded-lg border border-border bg-card px-3 text-body font-normal"
                />
              </label>
              <label className="flex flex-col gap-1 text-caption font-semibold text-text-primary">
                To
                <input
                  type="date"
                  value={to}
                  min={from}
                  max={today}
                  onChange={(e) => e.target.value && chooseView({ period: 'custom', from, to: e.target.value })}
                  className="min-h-input rounded-lg border border-border bg-card px-3 text-body font-normal"
                />
              </label>
            </div>
          )}
          <p className="text-caption text-text-secondary">
            {showingLine}. This only changes what you&apos;re looking at; it&apos;s remembered on this device.
          </p>
        </div>

        {upcoming ? (
          <p className="text-body text-text-secondary">
            This campaign starts on {shortDay(campaign.startedOn)}. Numbers appear from that day.
          </p>
        ) : isLoading || !report ? (
          <SkeletonCard />
        ) : (
          <>
            <p className="max-w-3xl text-[17px] leading-relaxed text-text-primary">{storyLine(report, spendNum)}</p>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {[
                { label: 'People who tapped', value: String(t!.visitors) },
                { label: 'Bookings', value: String(t!.booked) },
                { label: 'Money in', value: rupees(t!.gmv) },
                { label: 'Cost per booking', value: costPerBooking },
              ].map((k) => (
                <div key={k.label} className="flex flex-col gap-0.5 rounded-xl bg-surface p-3">
                  <span className="text-caption text-text-secondary">{k.label}</span>
                  <span className="font-data text-h2 font-bold tabular-nums text-text-primary">{k.value}</span>
                </div>
              ))}
            </div>
          </>
        )}

      </section>

      {report && !upcoming && <NextSteps report={report} />}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (detailsChanged && !saveDetails.isPending) saveDetails.mutate();
        }}
        className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 md:p-5"
      >
        <div>
          <h2 className="font-heading text-h3 text-text-primary">Campaign details</h2>
          <p className="text-caption text-text-secondary">Saved for good, and used in every number on this page.</p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-caption font-semibold text-text-primary">
            Money spent (₹)
            <input
              type="number"
              min={0}
              inputMode="numeric"
              value={spend}
              placeholder="0"
              onChange={(e) => setSpend(e.target.value)}
              className="min-h-input w-36 rounded-lg border border-border bg-card px-3 text-body font-normal"
            />
          </label>
          <label className="flex flex-col gap-1 text-caption font-semibold text-text-primary">
            Counting visits from
            <input
              type="date"
              value={startedOn}
              max={today}
              onChange={(e) => setStartedOn(e.target.value)}
              className="min-h-input rounded-lg border border-border bg-card px-3 text-body font-normal"
            />
          </label>
          <button
            type="submit"
            disabled={!detailsChanged || saveDetails.isPending}
            className="min-h-input rounded-lg bg-primary px-5 font-semibold text-white disabled:opacity-40"
          >
            {saveDetails.isPending ? 'Saving…' : 'Save'}
          </button>
          {savedAt !== null && !detailsChanged && (
            <span role="status" className="inline-flex min-h-input items-center gap-1.5 text-caption font-semibold text-success">
              <Check className="h-4 w-4" /> Saved
            </span>
          )}
        </div>
        <p className="text-caption text-text-secondary">
          Set “Counting visits from” to the day the link first went out. Taps before that day aren&apos;t counted.
        </p>
        {saveError && <p className="text-caption text-error">{saveError}</p>}
      </form>

      <ExtraTags campaign={campaign} />

      {report && report.totals.visitors > 0 && (
        <>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <DropOff report={report} />
            <DayByDay report={report} />
          </div>
          <WhatTheyDid report={report} />
          <CheckoutLosses report={report} />
          {report.internalExcluded > 0 && (
            <p className="text-caption text-text-secondary">
              {report.internalExcluded} visit{report.internalExcluded === 1 ? '' : 's'} from our team&apos;s phones or
              staff/owner accounts left out of these numbers.
            </p>
          )}

          <section className="flex flex-col gap-2 rounded-2xl bg-secondary p-4 text-white">
            <span className="text-overline text-white/70">Line for café owner pitches</span>
            <p className="text-body">{pitchLine(report, spendNum)}</p>
            <button
              type="button"
              onClick={() => copy('pitch', pitchLine(report, spendNum))}
              className="inline-flex min-h-[36px] w-fit items-center gap-1.5 rounded-lg bg-white/10 px-3 text-caption font-semibold hover:bg-white/20"
            >
              {copied === 'pitch' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied === 'pitch' ? 'Copied' : 'Copy'}
            </button>
          </section>

          <details className="group rounded-2xl border border-border bg-card p-4">
            <summary className="min-h-[32px] cursor-pointer font-heading text-body-emphasis text-text-primary">
              More detail: devices, areas, cafés
            </summary>
            <div className="mt-4 flex flex-col gap-4">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                <Bars title="Device" rows={report.devices} />
                <Bars title="Opened in" rows={report.inAppBrowser} />
                <Bars title="New vs seen before" rows={report.visitorType} />
                <Bars title="Neighbourhood (shared location)" rows={report.areas} />
                <Bars title="City browsed" rows={report.cities} />
              </div>
              {report.cafes.length > 0 && (
                <div className="overflow-x-auto rounded-xl border border-border">
                  <table className="w-full text-caption">
                    <thead className="bg-surface text-text-secondary">
                      <tr>
                        <th className="p-3 text-left">Café</th>
                        <th className="p-3 text-left">Area</th>
                        <th className="p-3 text-right">Viewed by</th>
                        <th className="p-3 text-right">Votes</th>
                        <th className="p-3 text-right">Booking starts</th>
                        <th className="p-3 text-right">Bookings</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.cafes.map((c) => (
                        <tr key={c.cafeId} className="border-t border-border">
                          <td className="p-3 font-semibold text-text-primary">
                            {c.name}
                            {c.isLeadListing && <span className="ml-1.5 font-normal text-text-secondary">· booking soon</span>}
                          </td>
                          <td className="p-3 text-text-secondary">{c.area}</td>
                          <td className="p-3 text-right tabular-nums">{c.views}</td>
                          <td className="p-3 text-right tabular-nums">{c.notifyMe}</td>
                          <td className="p-3 text-right tabular-nums">{c.bookingStarts}</td>
                          <td className="p-3 text-right tabular-nums">{c.bookings}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </details>
        </>
      )}
    </div>
  );
}

/** Visits that reached the site with someone else's tags but belong to this
 *  campaign, e.g. a boosted reel's ad that Meta tags with its own ad number. */
function ExtraTags({ campaign }: { campaign: MarketingCampaign }) {
  const queryClient = useQueryClient();
  const tags = campaign.extraTags ?? [];
  const [source, setSource] = useState('');
  const [tag, setTag] = useState('');
  const save = useMutation({
    mutationFn: (next: { source: string; campaign: string }[]) => updateMarketingCampaign(campaign.id, { extraTags: next }),
    onSuccess: () => {
      setSource('');
      setTag('');
      queryClient.invalidateQueries({ queryKey: ['admin', 'marketing-campaigns'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'analytics', 'ad-report'] });
    },
  });
  const input = 'min-h-input rounded-lg border border-border bg-card px-3 text-body font-normal';
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 md:p-5">
      <div>
        <h2 className="font-heading text-h3 text-text-primary">Also counts visits tagged</h2>
        <p className="text-caption text-text-secondary">
          When Meta sends people with its own tags (source “ig”, campaign = the ad number) instead of your short
          link, add them here and they count as this campaign.
        </p>
      </div>
      {tags.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {tags.map((t) => (
            <li key={`${t.source}/${t.campaign}`} className="inline-flex items-center gap-2 rounded-full bg-surface py-1 pl-3 pr-1 text-caption">
              <span className="font-data text-text-primary">
                {t.source} · {t.campaign}
              </span>
              <button
                type="button"
                aria-label={`Stop counting ${t.source} ${t.campaign}`}
                disabled={save.isPending}
                onClick={() => save.mutate(tags.filter((x) => x !== t))}
                className="flex h-7 w-7 items-center justify-center rounded-full text-text-secondary hover:bg-border/60 hover:text-text-primary"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-caption text-text-tertiary">None yet. Only visits from the short link count.</p>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (source.trim() && tag.trim()) save.mutate([...tags, { source: source.trim(), campaign: tag.trim() }]);
        }}
        className="flex flex-wrap items-end gap-3"
      >
        <label className="flex flex-col gap-1 text-caption font-semibold text-text-primary">
          Source
          <input value={source} onChange={(e) => setSource(e.target.value)} placeholder="ig" maxLength={60} className={`${input} w-28`} />
        </label>
        <label className="flex flex-col gap-1 text-caption font-semibold text-text-primary">
          Campaign tag
          <input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="23860597373710791" maxLength={100} className={`${input} w-56`} />
        </label>
        <button
          type="submit"
          disabled={!source.trim() || !tag.trim() || save.isPending}
          className="min-h-input rounded-lg border border-border px-4 font-semibold text-text-primary hover:bg-surface disabled:opacity-40"
        >
          {save.isPending ? 'Adding…' : 'Add'}
        </button>
      </form>
    </section>
  );
}

function ShortLink({
  campaign,
  copied,
  copy,
}: {
  campaign: MarketingCampaign;
  copied: string | null;
  copy: (id: string, text: string) => void;
}) {
  const [showQr, setShowQr] = useState(false);
  const [origin, setOrigin] = useState('https://khel-o.com');
  useEffect(() => setOrigin(window.location.origin), []);
  const url = `${origin}${campaign.shortPath}`;
  const qr = (size: number) =>
    `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=12&data=${encodeURIComponent(url)}`;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex max-w-full flex-wrap items-center gap-2 rounded-xl bg-surface p-1.5 pl-3">
        <code className="min-w-0 flex-1 truncate font-data text-body text-text-primary">{url.replace(/^https?:\/\//, '')}</code>
        <button
          type="button"
          onClick={() => copy(`link-${campaign.id}`, url)}
          className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-secondary px-3 text-caption font-semibold text-white"
        >
          {copied === `link-${campaign.id}` ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied === `link-${campaign.id}` ? 'Copied' : 'Copy link'}
        </button>
        <button
          type="button"
          onClick={() => setShowQr((v) => !v)}
          className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-caption font-semibold text-text-primary"
          aria-expanded={showQr}
        >
          <QrCode className="h-3.5 w-3.5" /> QR
        </button>
      </div>
      {showQr && (
        <div className="flex flex-wrap items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr(180)} alt="QR code for this link" width={180} height={180} className="rounded-lg bg-white" />
          <a href={qr(1000)} target="_blank" rel="noopener noreferrer" className="text-caption font-semibold text-primary">
            Open large QR for printing
          </a>
        </div>
      )}
    </div>
  );
}

export default function CampaignsPage() {
  const [tab, setTab] = useState<CampaignStatus>('live');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'marketing-campaigns'],
    queryFn: listMarketingCampaigns,
    staleTime: 30_000,
  });
  const all = useMemo(() => data?.campaigns ?? [], [data]);
  const shown = all.filter((c) => c.status === tab);
  const selected = all.find((c) => c.id === selectedId) ?? shown[0] ?? null;

  return (
    <div className="flex flex-col gap-6 pb-12">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <Target className="h-6 w-6 text-primary" />
            <h1 className="font-heading text-h1 text-text-primary">Campaigns</h1>
          </div>
          <p className="max-w-xl text-body text-text-secondary">
            Every link you post and what it brought in. Only campaigns created here show up.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreating((v) => !v)}
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-primary px-4 font-semibold text-white"
        >
          {creating ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {creating ? 'Close' : 'New campaign'}
        </button>
      </div>

      {creating && (
        <NewCampaignForm
          onDone={(c) => {
            setCreating(false);
            setTab('live');
            setSelectedId(c.id);
          }}
        />
      )}

      <div className="flex gap-1 rounded-xl bg-surface p-1 w-fit" role="tablist">
        {STATUS_TABS.map((s) => {
          const n = all.filter((c) => c.status === s.key).length;
          return (
            <button
              key={s.key}
              type="button"
              role="tab"
              aria-selected={tab === s.key}
              onClick={() => {
                setTab(s.key);
                setSelectedId(null);
              }}
              className={cn(
                'min-h-[36px] rounded-lg px-3 text-caption font-semibold',
                tab === s.key ? 'bg-card text-text-primary shadow-card' : 'text-text-secondary',
              )}
            >
              {s.label} {n > 0 && <span className="tabular-nums">· {n}</span>}
            </button>
          );
        })}
      </div>

      {isLoading && <SkeletonCard />}

      {!isLoading && shown.length === 0 && (
        <p className="rounded-2xl border border-dashed border-border p-6 text-center text-body text-text-secondary">
          {tab === 'live' ? 'No live campaigns. Tap “New campaign” to make a link.' : `No ${tab} campaigns.`}
        </p>
      )}

      {shown.length > 0 && (
        <section className="overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full min-w-[620px] text-caption">
            <thead className="bg-surface text-text-secondary">
              <tr>
                <th className="p-3 text-left">Campaign</th>
                <th className="p-3 text-left">Posted on</th>
                <th className="p-3 text-right">People</th>
                <th className="p-3 text-right">Bookings</th>
                <th className="p-3 text-right">Money in</th>
                <th className="p-3 text-right">Cost / booking</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {shown.map((c) => (
                <tr
                  key={c.id}
                  onClick={() => setSelectedId(c.id)}
                  className={cn('cursor-pointer border-t border-border hover:bg-surface/60', selected?.id === c.id && 'bg-surface')}
                >
                  <td className="p-3">
                    <button type="button" onClick={() => setSelectedId(c.id)} className="text-left font-semibold text-text-primary">
                      {c.name}
                    </button>
                    <div className="font-data text-[11px] text-text-secondary">/c/{c.slug}</div>
                    {c.summary?.nextStep && (
                      <div className={cn('mt-1 flex items-start gap-1 text-caption', c.summary.nextStep.tone === 'fix' ? 'text-error' : 'text-text-secondary')}>
                        {(() => {
                          const Icon = TONE[c.summary.nextStep.tone].icon;
                          return <Icon className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" aria-hidden />;
                        })()}
                        <span>{c.summary.nextStep.title}</span>
                      </div>
                    )}
                  </td>
                  <td className="p-3 text-text-secondary">
                    {CHANNEL_LABELS[c.channel]}
                    {c.paid ? ' · paid' : ''}
                  </td>
                  <td className="p-3 text-right">{c.summary?.visitors ?? '—'}</td>
                  <td className="p-3 text-right">{c.summary?.booked ?? '—'}</td>
                  <td className="p-3 text-right">{c.summary ? rupees(c.summary.gmv) : '—'}</td>
                  <td className="p-3 text-right font-semibold text-text-primary">
                    {c.summary?.costPerBooking != null ? rupees(c.summary.costPerBooking) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {selected && selected.status === tab && <CampaignDetail key={selected.id} campaign={selected} />}

      <p className="text-caption text-text-secondary">
        Visits that didn&apos;t come through a campaign link (bio taps without a link, ChatGPT, people typing the address)
        are in{' '}
        <Link href="/admin/analytics/traffic" className="font-semibold text-primary hover:underline">
          Traffic
        </Link>
        .
      </p>
    </div>
  );
}
