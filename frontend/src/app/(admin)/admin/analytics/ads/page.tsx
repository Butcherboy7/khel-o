'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, Copy, Target } from 'lucide-react';
import {
  getAdCampaignReport,
  listAdCampaigns,
  type AdCampaignReport,
  type NamedCount,
} from '@/lib/api/adminAnalytics';
import { SkeletonCard } from '@/components/ui';
import { formatCurrency } from '@/lib/format';

const LINK_TEMPLATE =
  'https://khel-o.com/?utm_source=meta&utm_medium=paid_social&utm_campaign={{campaign.name}}&utm_content={{ad.name}}';

const isoDay = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
const pct = (n: number) => `${Math.round(n * 100)}%`;
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

function readSpend(key: string): string {
  try {
    return window.localStorage.getItem(`khelo-ad-spend:${key}`) ?? '';
  } catch {
    return '';
  }
}

function useCopy() {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = async (id: string, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };
  return { copied, copy };
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

function pitchLine(r: AdCampaignReport, spend: number | null): string {
  const t = r.totals;
  const lead = spend ? `We spent ₹${spend.toLocaleString('en-IN')} promoting KHEL-O on Instagram` : 'Our Instagram campaign';
  const parts = [`${t.viewedCafe} opened a café page`];
  if (t.notifyMe) parts.push(`${t.notifyMe} tapped “Notify me” for cafés not yet on KHEL-O`);
  if (t.bookingStarted) parts.push(`${t.bookingStarted} started a booking`);
  if (t.booked) parts.push(`${t.booked} booked (${formatCurrency(t.gmv)} in sessions)`);
  return `${lead} and brought ${t.visitors} real visitors to the platform. ${parts.join(', ')}.`;
}

export default function AdCampaignsPage() {
  const today = new Date();
  const [from, setFrom] = useState(isoDay(new Date(today.getTime() - 6 * 86_400_000)));
  const [to, setTo] = useState(isoDay(today));
  const [selected, setSelected] = useState<string>('');
  const [spend, setSpend] = useState('');
  const { copied, copy } = useCopy();

  const { data: options } = useQuery({
    queryKey: ['admin', 'analytics', 'ad-campaigns'],
    queryFn: listAdCampaigns,
    staleTime: 60_000,
  });
  const campaigns = useMemo(() => options?.campaigns ?? [], [options]);

  // Default to the busiest Meta campaign, else the busiest tagged one.
  useEffect(() => {
    if (selected || campaigns.length === 0) return;
    const pick = campaigns.find((c) => c.source === 'meta') ?? campaigns[0];
    setSelected(`${pick.source}|${pick.campaign ?? ''}`);
  }, [campaigns, selected]);

  const [source, campaign] = selected ? selected.split('|') : ['', ''];
  useEffect(() => {
    if (selected) setSpend(readSpend(selected));
  }, [selected]);

  const { data: report, isLoading } = useQuery({
    queryKey: ['admin', 'analytics', 'ad-report', source, campaign, from, to],
    queryFn: () => getAdCampaignReport({ source, campaign: campaign || null, from, to }),
    enabled: Boolean(source),
    staleTime: 30_000,
  });

  const spendNum = Number(spend) > 0 ? Number(spend) : null;
  const per = (n: number) => (spendNum && n > 0 ? formatCurrency(Math.round((spendNum / n) * 100) / 100) : '—');
  const onSpend = (v: string) => {
    setSpend(v);
    try {
      window.localStorage.setItem(`khelo-ad-spend:${selected}`, v);
    } catch {}
  };

  return (
    <div className="flex flex-col gap-6 pb-12">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <Target className="h-6 w-6 text-primary" />
          <h1 className="font-heading text-h1 text-text-primary">Ad campaigns</h1>
        </div>
        <p className="text-body text-text-secondary">
          Follow a paid campaign from the first tap to a booking, counted in unique visitors.
        </p>
      </div>

      <section className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-4">
        <span className="text-caption font-semibold text-text-primary">Ad destination URL (paste into Meta Ads)</span>
        <div className="flex flex-wrap items-center gap-2">
          <code className="min-w-0 flex-1 break-all rounded-lg bg-surface px-3 py-2 text-[12px] text-text-primary">{LINK_TEMPLATE}</code>
          <button
            type="button"
            onClick={() => copy('link', LINK_TEMPLATE)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-caption font-semibold hover:bg-surface"
          >
            {copied === 'link' ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
            {copied === 'link' ? 'Copied' : 'Copy'}
          </button>
        </div>
        <p className="text-caption text-text-secondary">
          Meta fills in the campaign and ad names, so each Reel shows up separately below. Clicks without tags are still
          counted as Meta.
        </p>
      </section>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-caption font-semibold text-text-primary">
          Campaign
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="min-h-input min-w-[240px] rounded-lg border border-border bg-card px-3 text-body font-normal"
          >
            {campaigns.length === 0 && <option value="">No tagged visits yet</option>}
            {campaigns.map((c) => (
              <option key={`${c.source}|${c.campaign ?? ''}`} value={`${c.source}|${c.campaign ?? ''}`}>
                {c.source} · {c.campaign ?? '(no campaign name)'} — {c.sessions} visitors
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-caption font-semibold text-text-primary">
          From
          <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="min-h-input rounded-lg border border-border bg-card px-3 text-body font-normal" />
        </label>
        <label className="flex flex-col gap-1 text-caption font-semibold text-text-primary">
          To
          <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className="min-h-input rounded-lg border border-border bg-card px-3 text-body font-normal" />
        </label>
        <label className="flex flex-col gap-1 text-caption font-semibold text-text-primary">
          Spend (₹)
          <input
            type="number"
            min={0}
            inputMode="numeric"
            value={spend}
            placeholder="1000"
            onChange={(e) => onSpend(e.target.value)}
            className="min-h-input w-28 rounded-lg border border-border bg-card px-3 text-body font-normal"
          />
        </label>
      </div>

      {isLoading && <SkeletonCard />}

      {report && (
        <>
          <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
            {[
              { label: 'Visitors', value: report.totals.visitors, cost: per(report.totals.visitors) },
              { label: 'Opened a café', value: report.totals.viewedCafe, cost: per(report.totals.viewedCafe) },
              { label: 'Notify me', value: report.totals.notifyMe, cost: per(report.totals.notifyMe) },
              { label: 'Booked', value: report.totals.booked, cost: per(report.totals.booked) },
              { label: 'Came back another day', value: report.totals.cameBack, cost: null },
            ].map((k) => (
              <div key={k.label} className="rounded-2xl border border-border bg-card p-4">
                <div className="font-heading text-h2 font-bold tabular-nums text-text-primary">{k.value}</div>
                <div className="text-caption text-text-secondary">{k.label}</div>
                {k.cost && spendNum && <div className="mt-1 text-[11px] text-text-secondary">{k.cost} each</div>}
              </div>
            ))}
          </section>

          <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
            <h2 className="font-heading text-h3 text-text-primary">Funnel</h2>
            <ol className="flex flex-col gap-3">
              {report.funnel.map((s, i) => (
                <li key={s.key} className="flex flex-col gap-1">
                  <div className="flex items-baseline justify-between gap-3 text-caption">
                    <span className="font-semibold text-text-primary">{s.label}</span>
                    <span className="tabular-nums text-text-secondary">
                      <span className="font-bold text-text-primary">{s.sessions}</span> · {pct(s.ofLanded)} of visitors
                      {i > 0 && s.ofPrevious !== null && (
                        <span className={s.ofPrevious < 0.25 ? 'text-error' : ''}> · {pct(1 - s.ofPrevious)} lost here</span>
                      )}
                    </span>
                  </div>
                  <div className="h-3 overflow-hidden rounded-full bg-surface">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(1, s.ofLanded * 100)}%` }} />
                  </div>
                </li>
              ))}
            </ol>
            <p className="text-caption text-text-secondary">
              {report.totals.searched} searched or filtered · {report.totals.sharedLocation} shared their location ·{' '}
              {report.totals.newAccounts} new accounts · {report.totals.bookings} bookings worth {formatCurrency(report.totals.gmv)}
              {report.totals.googleSigninFailed > 0 && (
                <span className="text-error"> · {report.totals.googleSigninFailed} hit a Google sign-in error</span>
              )}
            </p>
          </section>

          <section className="flex flex-col gap-2 rounded-2xl bg-secondary p-4 text-white">
            <span className="text-overline text-white/70">Owner pitch line</span>
            <p className="text-body">{pitchLine(report, spendNum)}</p>
            <button
              type="button"
              onClick={() => copy('pitch', pitchLine(report, spendNum))}
              className="inline-flex w-fit items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-caption font-semibold hover:bg-white/20"
            >
              {copied === 'pitch' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied === 'pitch' ? 'Copied' : 'Copy'}
            </button>
          </section>

          {report.byAd.length > 0 && (
            <section className="overflow-x-auto rounded-2xl border border-border bg-card">
              <table className="w-full text-caption">
                <thead className="bg-surface text-text-secondary">
                  <tr>
                    <th className="p-3 text-left">Ad / Reel</th>
                    <th className="p-3 text-right">Visitors</th>
                    <th className="p-3 text-right">Opened a café</th>
                    <th className="p-3 text-right">Book / Notify</th>
                    <th className="p-3 text-right">Booked</th>
                  </tr>
                </thead>
                <tbody>
                  {report.byAd.map((a) => (
                    <tr key={a.ad} className="border-t border-border">
                      <td className="p-3 font-semibold text-text-primary">{a.ad}</td>
                      <td className="p-3 text-right tabular-nums">{a.sessions}</td>
                      <td className="p-3 text-right tabular-nums">{a.viewedCafe}</td>
                      <td className="p-3 text-right tabular-nums">{a.acted}</td>
                      <td className="p-3 text-right tabular-nums">{a.booked}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            <Bars title="Device" rows={report.devices} />
            <Bars title="Opened in" rows={report.inAppBrowser} />
            <Bars title="New vs seen before" rows={report.visitorType} />
            <Bars title="Neighbourhood (shared location)" rows={report.areas} />
            <Bars title="City browsed" rows={report.cities} />
            <Bars title="Visitors by day" rows={report.daily.map((d) => ({ name: d.date, sessions: d.sessions }))} />
          </div>

          {report.cafes.length > 0 && (
            <section className="overflow-x-auto rounded-2xl border border-border bg-card">
              <table className="w-full text-caption">
                <thead className="bg-surface text-text-secondary">
                  <tr>
                    <th className="p-3 text-left">Café</th>
                    <th className="p-3 text-left">Area</th>
                    <th className="p-3 text-right">Viewed by</th>
                    <th className="p-3 text-right">Notify me</th>
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
            </section>
          )}
        </>
      )}
    </div>
  );
}
