'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Gift, Printer, QrCode, Trophy, Users } from 'lucide-react';
import {
  adminGetChallenge, adminGetRewards, adminMakeRewards, adminRewardActive, adminSaveRewardsConfig,
  type RewardsConfig, type RewardsData, type RewardRow,
} from '@/lib/api/challenges';
import { Button, Card, CardContent, ErrorState, PageSpinner } from '@/components/ui';
import { HostTour, HostTutorialButton, useHostTour } from '@/components/challenge/admin/HostTour';
import { REWARDS_PAGE_STEPS } from '@/components/challenge/admin/hostTourSteps';

const rupees = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const day = (iso: string) =>
  new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short' }).format(new Date(iso));

/** Make the challenge's rewards and see every time one is used. Rewards are
 *  ordinary offers locked to the people who earned them; payments don't change. */
export default function ChallengeRewardsPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const key = ['admin', 'challenge', id, 'rewards'];
  const { data, isLoading, isError, error, refetch } = useQuery({ queryKey: key, queryFn: () => adminGetRewards(id), refetchInterval: 30_000 });
  const challenge = useQuery({ queryKey: ['admin', 'challenge', id], queryFn: () => adminGetChallenge(id) });
  const [busy, setBusy] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const tour = useHostTour('rewards', Boolean(data));

  const run = async (what: string, fn: () => Promise<RewardsData>, ok?: string) => {
    setBusy(what);
    setFlash(null);
    try {
      qc.setQueryData(key, await fn());
      if (ok) setFlash(ok);
    } catch (e) {
      setFlash((e as Error).message || 'That didn’t work. Try again.');
    } finally {
      setBusy(null);
    }
  };

  if (isLoading) return <PageSpinner label="Loading rewards" />;
  if (isError || !data) return <ErrorState message={(error as Error)?.message} onRetry={() => refetch()} />;

  const kinds = new Set(data.rewards.map((r) => r.kind));
  const prizesMade = kinds.has('prize_1');
  const owed = data.rewards.flatMap((r) => r.addBack);
  const owedByCafe = owed.reduce<Record<string, number>>((acc, a) => ({ ...acc, [a.cafe]: (acc[a.cafe] ?? 0) + a.amount }), {});
  const title = challenge.data?.challenge.title ?? 'Challenge';

  return (
    <div className="flex flex-col gap-5 pb-16">
      <div>
        <Link href={`/admin/challenges/${id}`} className="text-caption font-semibold text-text-secondary hover:text-text-primary">← {title}</Link>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
          <h1 className="font-heading text-h1 text-text-primary">Rewards</h1>
          <HostTutorialButton onClick={tour.start} />
        </div>
        <p className="text-body text-text-secondary">
          Each reward works only on the accounts that earned it. Players see theirs on their challenge page with a “Book” button.
        </p>
      </div>

      {flash && (
        <button type="button" onClick={() => setFlash(null)} className="rounded-xl bg-primary/10 px-3 py-2 text-left text-caption text-text-primary">
          {flash} <span className="text-text-secondary">(tap to hide)</span>
        </button>
      )}

      {Object.keys(owedByCafe).length > 0 && (
        <Card className="border-warning/40">
          <CardContent className="p-4">
            <p className="font-semibold text-text-primary">Add back in the cafés’ manual payouts (KHEL-O pays these)</p>
            <ul className="mt-1 text-body text-text-primary">
              {Object.entries(owedByCafe).map(([cafe, amount]) => (
                <li key={cafe}>{cafe}: <span className="font-semibold">{rupees(amount)}</span></li>
              ))}
            </ul>
            <p className="mt-1 text-caption text-text-secondary">Counts paid bookings only. Cancelled or unpaid ones are left out.</p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        <Card data-host-tour="podium">
          <CardContent className="flex h-full flex-col gap-2 p-4">
            <p className="flex items-center gap-2 font-semibold text-text-primary"><Trophy className="h-4 w-4 text-warning" /> Podium rewards</p>
            <p className="text-caption text-text-secondary">
              1st/2nd/3rd: {data.config.prizeHours.map((h) => `${h} hr`).join(' / ')} for {rupees(data.config.prizePrice)} at the challenge café,
              1 seat, any setup, {data.config.prizeDays} days.
              {data.config.winnerPartnersOn
                ? ` Plus the champion’s ${data.config.winnerPercent}% off at ${data.partnerCafes.length} other partner ${data.partnerCafes.length === 1 ? 'café' : 'cafés'} for ${data.config.winnerDays} days.`
                : ' The champion’s % off at other cafés is switched off (Reward settings).'}
            </p>
            {data.config.winnerPartnersOn && data.partnerCafes.length > 0 && (
              <p className="text-xs text-text-secondary">Partner cafés: {data.partnerCafes.join(', ')}</p>
            )}
            <div className="mt-auto pt-2">
              <Button
                variant={prizesMade ? 'outline' : 'primary'}
                size="sm"
                disabled={!data.standingsReady}
                isLoading={busy === 'prizes'}
                onClick={() => run('prizes', () => adminMakeRewards(id, 'prizes'), 'Podium rewards made. The players see them on their challenge page now.')}
              >
                <Gift className="h-4 w-4" /> {prizesMade ? 'Make any missing podium rewards' : 'Make the podium rewards'}
              </Button>
              <p className="mt-1 text-xs text-text-secondary">Finish on the Challenge day page makes these for you. This button only fills in any that are missing.</p>
              {!data.standingsReady && <p className="mt-1 text-xs text-text-secondary">Enter the final’s result first.</p>}
              {data.testPlaces.length > 0 && (
                <p className="mt-1 text-xs text-text-secondary" data-test-places>
                  {data.testPlaces.map((p) => ['1st', '2nd', '3rd'][p - 1]).join(', ')} place{data.testPlaces.length > 1 ? 's are' : ' is'} a
                  test or practice entry: no reward for {data.testPlaces.length > 1 ? 'them' : 'it'}, and nobody moves up into it.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
        <Card data-host-tour="waitlist">
          <CardContent className="flex h-full flex-col gap-2 p-4">
            <p className="flex items-center gap-2 font-semibold text-text-primary"><Users className="h-4 w-4 text-primary" /> Waitlist thank-you</p>
            <p className="text-caption text-text-secondary">
              {data.config.waitlistPercent}% off at the challenge café for everyone who was on the waitlist ({data.waitlistPeople} people,
              including those who moved up). One booking each, from the challenge day for {data.config.waitlistDays} days.
            </p>
            <div className="mt-auto pt-2">
              <Button
                variant={kinds.has('waitlist') ? 'outline' : 'primary'}
                size="sm"
                disabled={data.waitlistPeople === 0}
                isLoading={busy === 'waitlist'}
                onClick={() => run('waitlist', () => adminMakeRewards(id, 'waitlist'), 'Done. Everyone on the waitlist sees it on their challenge page.')}
              >
                <Gift className="h-4 w-4" /> {kinds.has('waitlist') ? 'Update who gets it' : 'Make the waitlist reward'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Poster title={title} url={data.posterUrl} qr={data.posterQr} />

      <Settings
        config={data.config}
        locked={data.rewards.length > 0}
        busy={busy === 'config'}
        onSave={(cfg) => run('config', () => adminSaveRewardsConfig(id, cfg), 'Saved.')}
      />

      <h2 className="font-heading text-h2 text-text-primary" data-host-tour="uses">Every use</h2>
      {data.rewards.length === 0 && <p className="text-caption text-text-secondary">No rewards made yet.</p>}
      {data.rewards.map((r) => (
        <RewardCard key={r.id} r={r} busy={busy === r.id} onToggle={() => run(r.id, () => adminRewardActive(id, r.id, !r.isActive))} />
      ))}

      <HostTour steps={REWARDS_PAGE_STEPS} open={tour.open} onClose={tour.close} />
    </div>
  );
}

/** One printed QR for the winners. It opens their own challenge page, where
 *  their rewards wait behind their sign-in; it holds no code. */
function Poster({ title, url, qr }: { title: string; url: string; qr: string }) {
  const print = () => {
    const w = window.open('', '_blank', 'width=800,height=1000');
    if (!w) return;
    const esc = (t: string) => t.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch] as string);
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Winners: scan to see your rewards</title>
<style>
  @page { size: A4; margin: 18mm; }
  body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; text-align: center; color: #111; margin: 0; }
  .kicker { letter-spacing: .2em; text-transform: uppercase; font-weight: 700; color: #D0463C; font-size: 14pt; margin-top: 10mm; }
  h1 { font-size: 34pt; margin: 6mm 0 2mm; }
  p { font-size: 15pt; margin: 2mm 0; }
  img { width: 120mm; height: 120mm; image-rendering: pixelated; margin: 10mm auto 6mm; display: block; }
  .small { font-size: 11pt; color: #555; }
</style></head><body>
<div class="kicker">${esc(title)}</div>
<h1>Winners: scan to see your rewards</h1>
<p>Scan with your phone camera and sign in with the account you signed up with.</p>
<img src="${qr}" alt="QR code">
<p class="small">${esc(url.replace(/^https?:\/\//, ''))}</p>
<p class="small">Your rewards are on your own page, with a Book button.</p>
<script>window.onload = () => { window.print(); };</script>
</body></html>`);
    w.document.close();
  };
  return (
    <Card data-host-tour="poster">
      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
        {/* eslint-disable-next-line @next/next/no-img-element -- a data: URL QR made by our API */}
        <img src={qr} alt="QR code to the players' own challenge page" className="h-28 w-28 rounded-lg border border-border bg-white p-1" />
        <div className="flex-1">
          <p className="flex items-center gap-2 font-semibold text-text-primary">
            <QrCode className="h-4 w-4 text-primary" /> Winners: scan to see your rewards
          </p>
          <p className="text-caption text-text-secondary">
            Print it and put it by the screen. Winners scan it, sign in, and their rewards are on their page. It has no code in it, so
            anyone else just sees their own page.
          </p>
          <div className="mt-2">
            <Button variant="secondary" size="sm" onClick={print}>
              <Printer className="h-4 w-4" /> Print the poster
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function RewardCard({ r, busy, onToggle }: { r: RewardRow; busy: boolean; onToggle: () => void }) {
  return (
    <Card className={r.isActive ? '' : 'opacity-60'}>
      <CardContent className="p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="font-semibold text-text-primary">
              {r.label}
              {r.superseded && <span className="ml-1.5 rounded bg-surface px-1.5 text-xs font-semibold text-text-secondary">Replaced</span>}
              {r.forPeople.length > 0 && r.forPeople.length <= 3 && <span className="font-normal text-text-secondary"> · {r.forPeople.join(', ')}</span>}
              {r.forPeople.length > 3 && <span className="font-normal text-text-secondary"> · {r.peopleCount} people</span>}
            </p>
            <p className="text-caption text-text-secondary">
              {day(r.startsAt)}–{day(r.endsAt)} · {r.kheloFunded ? 'KHEL-O pays the discount' : 'Café gives it'} · code {r.code} (private)
            </p>
            {r.replacesRewardId && (
              <p className="mt-1 text-xs text-text-secondary">Replaces an earlier reward after a corrected result. The earlier one stays in the list below.</p>
            )}
            {r.financialReviewNote && (
              <p className="mt-1 rounded-lg bg-warning/10 px-2.5 py-1.5 text-xs font-semibold text-text-primary" role="note">
                Needs a look at the books: {r.financialReviewNote}
              </p>
            )}
          </div>
          {!r.superseded && (
            <Button variant="ghost" size="sm" isLoading={busy} onClick={onToggle}>
              {r.isActive ? 'Switch off' : 'Switch on'}
            </Button>
          )}
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <Num label="Paid bookings" value={r.paidUses} />
          <Num label="Discount given" value={rupees(r.discountTotal)} />
          <Num label="Customers paid" value={rupees(r.paidTotal)} />
        </div>
        {r.uses.length > 0 && (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-caption">
              <thead className="text-text-secondary">
                <tr>
                  <th className="py-1 pr-3 font-semibold">Booking</th>
                  <th className="py-1 pr-3 font-semibold">Player</th>
                  <th className="py-1 pr-3 font-semibold">Café</th>
                  <th className="py-1 pr-3 font-semibold">When</th>
                  <th className="py-1 pr-3 font-semibold">Status</th>
                  <th className="py-1 pr-3 text-right font-semibold">Discount</th>
                  <th className="py-1 text-right font-semibold">Paid</th>
                </tr>
              </thead>
              <tbody className="text-text-primary">
                {r.uses.map((u) => (
                  <tr key={u.bookingReference} className="border-t border-border">
                    <td className="py-1.5 pr-3 font-mono">{u.bookingReference}</td>
                    <td className="py-1.5 pr-3">{u.player}</td>
                    <td className="py-1.5 pr-3">{u.cafe}</td>
                    <td className="py-1.5 pr-3">{u.sessionDate} {u.startTime} · {u.hours} hr</td>
                    <td className="py-1.5 pr-3">{u.status.replace(/_/g, ' ')}</td>
                    <td className="py-1.5 pr-3 text-right">{rupees(u.discount)}</td>
                    <td className="py-1.5 text-right">{rupees(u.paid)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {r.unpaidOrCancelled > 0 && (
          <p className="mt-2 text-xs text-text-secondary">{r.unpaidOrCancelled} unpaid or cancelled (not counted).</p>
        )}
      </CardContent>
    </Card>
  );
}

function Num({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl bg-surface p-2.5">
      <p className="text-xs font-semibold text-text-secondary">{label}</p>
      <p className="font-heading text-h3 tabular-nums text-text-primary">{value}</p>
    </div>
  );
}

/** The reward settings. Changing them only affects rewards made afterwards. */
function Settings({ config, locked, busy, onSave }: { config: RewardsConfig; locked: boolean; busy: boolean; onSave: (c: RewardsConfig) => void }) {
  const [c, setC] = useState(config);
  const [hours, setHours] = useState(config.prizeHours.join(', '));
  const set = <K extends keyof RewardsConfig>(k: K, v: RewardsConfig[K]) => setC({ ...c, [k]: v });
  const n = (k: keyof RewardsConfig, label: string, suffix: string) => (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-semibold text-text-secondary">{label}</span>
      <span className="flex items-center gap-1">
        <input
          inputMode="numeric"
          value={String(c[k])}
          onChange={(e) => set(k, Number(e.target.value.replace(/\D/g, '')) as never)}
          className="h-9 w-20 rounded-lg border border-border bg-surface px-2 text-caption text-text-primary"
        />
        <span className="text-xs text-text-secondary">{suffix}</span>
      </span>
    </label>
  );
  const tick = (k: 'prizeKheloFunded' | 'winnerKheloFunded' | 'waitlistKheloFunded' | 'winnerPartnersOn', label: string) => (
    <label className="flex items-center gap-2 text-caption text-text-primary">
      <input type="checkbox" checked={c[k]} onChange={(e) => set(k, e.target.checked)} /> {label}
    </label>
  );

  return (
    <details className="rounded-2xl border border-border bg-card">
      <summary className="cursor-pointer px-4 py-3 text-caption font-semibold text-text-primary">
        Reward settings {locked ? '(changes only affect rewards made after saving)' : ''}
      </summary>
      <div className="flex flex-col gap-4 px-4 pb-4">
        <div className="flex flex-wrap gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-text-secondary">Reward hours (1st, 2nd, 3rd)</span>
            <input value={hours} onChange={(e) => setHours(e.target.value)} className="h-9 w-32 rounded-lg border border-border bg-surface px-2 text-caption text-text-primary" />
          </label>
          {n('prizePrice', 'Price', '₹')}
          {n('prizeDays', 'Rewards last', 'days')}
          {tick('prizeKheloFunded', 'KHEL-O pays the podium discount')}
        </div>
        <div className="flex flex-wrap gap-4">
          {tick('winnerPartnersOn', 'Give the champion % off at other partner cafés')}
          {n('winnerPercent', 'Champion % off elsewhere', '%')}
          {n('winnerDays', 'Lasts', 'days')}
          {tick('winnerKheloFunded', 'KHEL-O pays it')}
        </div>
        <div className="flex flex-wrap gap-4">
          {n('waitlistPercent', 'Waitlist % off', '%')}
          {n('waitlistDays', 'Days after the challenge', 'days')}
          {tick('waitlistKheloFunded', 'KHEL-O pays it')}
        </div>
        <div>
          <Button
            variant="secondary"
            size="sm"
            isLoading={busy}
            onClick={() =>
              onSave({
                ...c,
                prizeHours: hours.split(/[,\s]+/).filter(Boolean).map(Number).filter((x) => x > 0).slice(0, 3),
              })
            }
          >
            Save settings
          </Button>
        </div>
      </div>
    </details>
  );
}
