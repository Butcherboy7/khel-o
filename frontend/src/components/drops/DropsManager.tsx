'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, Eye, ImagePlus, Plus, Ticket } from 'lucide-react';
import { Button, Card, CardContent, EmptyState, Input, SkeletonCard } from '@/components/ui';
import { OwnerPageHeader } from '@/components/owner/OwnerPageHeader';
import { OwnerLoadError } from '@/components/owner/OwnerLoadError';
import { createDrop, gameRuleFor, listOwnerDrops, type NewDrop, type OwnerDropList } from '@/lib/api/drops';
import { clock, rupees, shortDate } from '@/lib/drops';
import { DropPriceOptions, overlapping, priceOptionsPayload, type PriceOptions } from '@/components/drops/DropPriceOptions';
import { uploadCafePhoto } from '@/lib/api/settings';

const STATE_LABEL: Record<string, string> = {
  draft: 'Hidden · only you see it',
  cancelled: 'Cancelled',
  soon: 'Opens soon',
  early: 'Early access',
  open: 'Live',
};
const STATE_TONE: Record<string, string> = {
  draft: 'bg-amber-100 text-amber-800',
  cancelled: 'bg-surface text-text-secondary',
  soon: 'bg-sky-100 text-sky-800',
  early: 'bg-violet-100 text-violet-800',
  open: 'bg-green-100 text-green-800',
};

/** A datetime-local value ("2026-11-12T12:00") is café time (IST). */
const istIso = (v: string) => `${v}:00+05:30`;

export interface DropExtra {
  feesTaken: number;
  waitlist: number;
  refunded: number;
}

/** The list of drops plus the New drop form. Café owners see their own café; an admin
 *  (base="/admin/drops") sees every café and can set a drop up for any of them. */
export function DropsManager({ base = '/owner/drops', admin = false, extra }: { base?: string; admin?: boolean; extra?: Record<string, DropExtra> }) {
  const qc = useQueryClient();
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['owner', 'drops'], queryFn: listOwnerDrops });
  const [creating, setCreating] = useState(false);
  // Quick Find "new launch drop" opens the form (?new=1).
  const wantsNew = useSearchParams().get('new') === '1';
  useEffect(() => {
    if (wantsNew && !admin) setCreating(true);
  }, [wantsNew, admin]);

  return (
    <div className="flex flex-col gap-6">
      <OwnerPageHeader
        guide={admin ? undefined : 'drops'}
        title="Launch drops"
        description={
          admin
            ? 'Set up and run a launch drop for any café. People reserve with a small booking fee that comes off their bill, and pay the rest at the café.'
            : 'Sell seats before a big game launch. Players pay a small fee now, the rest at your café.'
        }
        action={
          !creating && (
            <div data-tour="drops-new" className="w-full sm:w-auto">
              <Button onClick={() => setCreating(true)} fullWidth className="sm:w-auto">
                <Plus className="mr-1.5 h-4 w-4" /> New drop
              </Button>
            </div>
          )
        }
      />

      {!admin && !creating && (
        <Link
          href="/owner/gta6-guide"
          data-tour="drops-guide"
          className="flex min-h-[44px] items-center justify-between gap-3 rounded-2xl border border-primary/30 bg-primary/5 px-4 py-3 text-body font-semibold text-text-primary hover:bg-primary/10"
        >
          <span>New to drops? Read the 2-minute guide</span>
          <ChevronRight className="h-4 w-4 flex-shrink-0 text-primary" aria-hidden />
        </Link>
      )}

      {creating && data && (
        <NewDropForm
          list={data}
          onCancel={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            qc.invalidateQueries({ queryKey: ['owner', 'drops'] });
            qc.invalidateQueries({ queryKey: ['admin', 'drops'] });
          }}
        />
      )}

      {isLoading && <SkeletonCard />}
      {error && <OwnerLoadError error={error} title="Couldn’t load your drops" onRetry={() => refetch()} />}
      {data && !data.drops.length && !creating && (
        <EmptyState icon={<Ticket className="h-6 w-6" />} title="No drops yet" description="Tap New drop to make your first one." />
      )}
      {data?.drops.map((d, i) => {
        const sold = d.seatsTotal - d.blocks.reduce((n, b) => n + b.seatsLeft, 0);
        return (
          <Card key={d.id} elevation="resting" data-tour={i === 0 ? 'drops-list' : undefined} className="relative transition-shadow hover:shadow-card">
            <CardContent className="flex flex-col gap-3 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-caption font-semibold ${STATE_TONE[d.state] ?? 'bg-surface text-text-secondary'}`}>
                    <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
                    {STATE_LABEL[d.state] ?? d.state}
                  </span>
                  <h2 className="mt-1 font-heading text-h3 font-bold text-text-primary">
                    <Link href={`${base}/${d.id}`} className="after:absolute after:inset-0 focus-visible:outline-none">
                      {d.title}
                    </Link>
                  </h2>
                  <p className="text-caption text-text-secondary">
                    {[admin ? d.cafe.name : '', d.playsOn ? `On ${d.playsOn}` : '', d.startsOn && d.endsOn ? `${shortDate(d.startsOn)} – ${shortDate(d.endsOn)}` : ''].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <a
                  href={`/drops/${d.slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`See ${d.title} as customers do (opens a new tab)`}
                  title="See what customers see"
                  className="relative z-10 flex h-11 w-11 flex-none items-center justify-center rounded-xl border border-border text-text-secondary hover:bg-surface hover:text-text-primary"
                >
                  <Eye className="h-5 w-5" aria-hidden />
                </a>
              </div>
              <dl className="grid grid-cols-3 gap-2 rounded-xl bg-surface p-2.5 text-center">
                {[
                  ['Seats sold', `${sold} of ${d.seatsTotal}`],
                  ['Paid', String(d.paidReservations)],
                  ['Per hour', rupees(d.pricePerHour)],
                ].map(([k, v]) => (
                  <div key={k} className="min-w-0">
                    <dt className="truncate text-[11px] text-text-secondary">{k}</dt>
                    <dd className="font-heading text-body-emphasis font-bold text-text-primary">{v}</dd>
                  </div>
                ))}
              </dl>
              {extra?.[d.id] && (
                <p className="text-caption text-text-secondary">
                  {rupees(extra[d.id].feesTaken)} in booking fees · {extra[d.id].waitlist} waiting
                  {extra[d.id].refunded > 0 ? ` · ${extra[d.id].refunded} refunded` : ''}
                </p>
              )}
              <span className="flex items-center justify-between text-body font-semibold text-primary" aria-hidden>
                Manage slots, bookings and prices <ChevronRight className="h-4 w-4" />
              </span>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="flex items-center gap-2 font-heading text-body-emphasis font-bold text-text-primary">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-caption font-bold text-white">{n}</span>
        {title}
      </h3>
      {children}
    </section>
  );
}

const mins = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

/** Start and end as minutes from midnight; an end at or before the start is the next morning. */
const spanOf = (start: string, end: string): [number, number] => {
  const s = mins(start);
  let e = mins(end);
  if (e <= s) e += 1440;
  return [s, e];
};

/** 18:00 → "6 PM"; past midnight it says so: 27:00 → "3 AM (next day)". */
const clockAt = (m: number) => `${clock(`${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`)}${m >= 1440 ? ' (next day)' : ''}`;

/** Shows, in plain words and as a bar, what other players will see: how many of this system
 *  are kept for the drop, in which hours, and how many stay open for normal booking. */
function KeptPreview({ game, tierName, total, kept, start, end, openAt, closeAt }: {
  game: string; tierName: string; total: number; kept: number; start: string; end: string; openAt: string | null; closeAt: string | null;
}) {
  const rest = Math.max(0, total - kept);
  let [s, e] = spanOf(start, end);
  const [lo, hi] = openAt && closeAt ? spanOf(openAt, closeAt) : [s, e];
  if (s < lo) { s += 1440; e += 1440; }
  const range = Math.max(60, hi - lo);
  const left = Math.max(0, ((s - lo) / range) * 100);
  const width = Math.max(2, Math.min(100 - left, ((e - s) / range) * 100));
  const allDay = e - s >= 1440;
  const full = allDay || (left < 0.5 && left + width > 99.5);
  const when = allDay ? <>All 24 hours (from <strong>{clockAt(s)}</strong> to the same time the next day)</> : <>From <strong>{clockAt(s)}</strong> to <strong>{clockAt(e)}</strong></>;
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-3" aria-live="polite">
      <p className="text-caption font-semibold uppercase tracking-wide text-text-secondary">What other players will see</p>
      <div className="relative h-8 overflow-hidden rounded-lg bg-success/15" role="img" aria-label={`${kept} of ${total} ${tierName} kept for ${game}`}>
        <div className="absolute inset-y-0 flex items-center justify-center bg-primary text-caption font-bold text-white" style={{ left: `${left}%`, width: `${width}%` }}>
          {game}
        </div>
      </div>
      <div className="flex justify-between text-caption text-text-secondary">
        <span>{clockAt(lo)}</span>
        <span>{clockAt(Math.max(hi, lo + 60))}</span>
      </div>
      <p className="text-body text-text-primary">
        {when}, {kept} of your {total} {tierName} {kept === 1 ? 'is' : 'are'} kept for {game} and show as taken for normal booking. Players can reserve any of those hours.
        {rest > 0 ? <> The other {rest} stay open for normal players.</> : <> Nothing is left for normal players in those hours.</>}
        {!full && <> Outside those hours all {total} are open for normal booking.</>}
      </p>
    </div>
  );
}

function NewDropForm({ list, onCancel, onCreated }: { list: OwnerDropList; onCancel: () => void; onCreated: () => void }) {
  const [low, high] = list.suggestedPrice;
  const [cafeId, setCafeId] = useState(list.cafes[0]?.id ?? '');
  const [tierId, setTierId] = useState('');
  const [title, setTitle] = useState('GTA 6 Launch Drop');
  const [game, setGame] = useState('GTA 6');
  const [tagline, setTagline] = useState('');
  const [cover, setCover] = useState('');
  const [uploading, setUploading] = useState(false);
  const [price, setPrice] = useState(String(low));
  const [deposit, setDeposit] = useState('100');
  const [depositLong, setDepositLong] = useState('200');
  const [maxHours, setMaxHours] = useState('5');
  const [priceOpts, setPriceOpts] = useState<PriceOptions>({ lengthPrices: [], timePrices: [] });
  const [code, setCode] = useState('');
  const [earlyAt, setEarlyAt] = useState('');
  const [publicAt, setPublicAt] = useState('');
  const [startsOn, setStartsOn] = useState(() => new Date().toLocaleDateString('en-CA'));
  const [dayStart, setDayStart] = useState('12:00');
  const [dayEnd, setDayEnd] = useState('23:00');
  const [daySeats, setDaySeats] = useState(2);
  const [wholeDay, setWholeDay] = useState(true);
  const [live, setLive] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const priceNum = Number(price);
  const tiers = list.cafes.find((c) => c.id === cafeId)?.tiers ?? [];
  // Only setups that can run the game. GTA 6: PS5, PS5 Pro, Xbox Series X|S (no VR, PC or racing rigs).
  const rule = gameRuleFor(list.gameRules, game);
  const runs = (t: (typeof tiers)[number]) => (rule ? t.runs?.[rule.key] ?? 'check' : 'any');
  const usable = tiers.filter((t) => runs(t) !== 'no');
  const unusable = tiers.filter((t) => runs(t) === 'no');
  const tier = usable.find((t) => t.id === tierId) ?? null;
  const gameName = rule?.label ?? (game.trim() || 'it');
  const cafeRow = list.cafes.find((c) => c.id === cafeId);
  const openAt = cafeRow?.openingTime ?? null;
  const closeAt = cafeRow?.closingTime ?? null;
  // "The whole day" = every hour the café is open, past midnight too. A 24/7 café runs
  // 6 AM to 6 AM, so the night crowd (11 PM to 3 AM) fits in one night's session.
  const open24 = !!openAt && openAt === closeAt;
  const canWholeDay = !!openAt && !!closeAt;
  const whole = wholeDay && canWholeDay;
  const startT = whole ? (open24 ? '06:00' : (openAt as string)) : dayStart;
  const endT = whole ? (open24 ? '06:00' : (closeAt as string)) : dayEnd;
  const pickTier = (id: string) => {
    setTierId(id);
    const t = tiers.find((x) => x.id === id);
    if (t) setDaySeats((n) => Math.min(Math.max(1, n), t.totalSeats));
  };
  // Only one setup fits: pick it for them. Changing the game drops a pick that no longer fits.
  const usableIds = usable.map((t) => t.id).join(',');
  useEffect(() => {
    if (tierId && !usable.some((t) => t.id === tierId)) setTierId('');
    else if (!tierId && usable.length === 1) pickTier(usable[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usableIds, tierId]);

  const upload = async (file: File | undefined) => {
    if (!file || !cafeId) return;
    if (file.size > 8 * 1024 * 1024) return setError('That photo is over 8 MB. Pick a smaller one.');
    setUploading(true);
    setError(null);
    try {
      setCover(await uploadCafePhoto(cafeId, file, 'play_area'));
    } catch (e) {
      setError((e as Error)?.message || 'Could not upload the photo. Try again.');
    } finally {
      setUploading(false);
    }
  };

  const submit = async () => {
    setError(null);
    if (!cafeId || !title.trim() || !game.trim()) return setError('Fill in the title and the game.');
    if (!tier) return setError(usable.length === 0 ? `None of your setups can run ${gameName}.` : `Pick which setup has ${gameName}.`);
    if (!startsOn || !startT || !endT || daySeats < 1) return setError('Set the first day, the hours and the seats.');
    if (overlapping(priceOpts.timePrices)) return setError('Two of your time prices cover the same hours. Change one so they don’t overlap.');
    const body: NewDrop = {
      cafeId,
      hardwareTierId: tier.id,
      title: title.trim(),
      game: game.trim(),
      tagline: tagline.trim() || undefined,
      coverImageUrl: cover || undefined,
      pricePerHour: priceNum,
      depositAmount: Number(deposit),
      maxHours: Number(maxHours) || undefined,
      depositAmountLong: maxHours ? Number(depositLong) : undefined,
      ...priceOptionsPayload(priceOpts),
      earlyAccessCode: code.trim() || undefined,
      earlyAccessStartsAt: istIso(earlyAt || publicAt || nowIst()),
      publicStartsAt: istIso(publicAt || nowIst()),
      status: live ? 'live' : 'draft',
      blocks: [],
      dailyStartTime: startT,
      dailyEndTime: endT,
      dailySeats: daySeats,
      startsOn,
      days: 14,
    };
    setBusy(true);
    try {
      await createDrop(body);
      onCreated();
    } catch (e) {
      setError((e as Error)?.message || 'Could not save the drop.');
    } finally {
      setBusy(false);
    }
  };

  const field = 'h-11 rounded-lg border border-border bg-card px-2 text-body text-text-primary';

  return (
    <Card elevation="raised" data-tour="drops-new">
      <CardContent className="flex flex-col gap-6 p-4 sm:p-5">
        <h2 className="font-heading text-h3 font-bold text-text-primary">New launch drop</h2>

        <Step n={1} title="What are you selling?">
          {list.cafes.length > 1 && (
            <label className="flex flex-col gap-1.5 text-body font-medium text-text-primary">
              Café
              <select value={cafeId} onChange={(e) => { setCafeId(e.target.value); setTierId(''); }} className="h-11 rounded-xl border border-border bg-card px-3 text-body">
                {list.cafes.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </label>
          )}
          <Input label="Name" value={title} onChange={(e) => setTitle(e.target.value)} />
          <Input label="Game" value={game} onChange={(e) => setGame(e.target.value)} />
        </Step>

        <Step n={2} title={`Which of your setups have ${gameName}?`}>
          {rule && (
            <p className="rounded-xl bg-surface p-3 text-caption text-text-secondary">
              <span className="font-semibold text-text-primary">{rule.label} runs on {rule.runsOn}.</span> {rule.notOn}
            </p>
          )}
          {tiers.length === 0 ? (
            <p className="rounded-xl bg-surface p-3 text-body text-text-secondary">
              You have no setups yet. <Link href="/owner/tiers" className="font-semibold text-primary">Add one in Setups &amp; prices</Link>, then come back.
            </p>
          ) : usable.length === 0 ? (
            <p className="rounded-xl border border-warning/40 bg-warning/10 p-3 text-body text-text-primary">
              None of your setups can run {gameName}. Add your PS5 or Xbox Series X|S in{' '}
              <Link href="/owner/tiers" className="font-semibold text-primary">Setups &amp; prices</Link>, then come back.
            </p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Setup">
              {usable.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="radio"
                  aria-checked={t.id === tierId}
                  onClick={() => pickTier(t.id)}
                  className={`flex min-h-[56px] items-center justify-between gap-3 rounded-xl border-2 px-3 text-left ${t.id === tierId ? 'border-primary bg-primary/5' : 'border-border bg-card'}`}
                >
                  <span className="flex flex-col">
                    <span className="font-semibold text-text-primary">{t.name}</span>
                    {runs(t) === 'check' && rule && <span className="text-caption text-warning">Make sure these are a PS5 or Xbox Series X|S</span>}
                  </span>
                  <span className="text-caption text-text-secondary">you have {t.totalSeats}</span>
                </button>
              ))}
            </div>
          )}
          {unusable.length > 0 && rule && (
            <p className="text-caption text-text-secondary">
              Not shown because they can&rsquo;t run {rule.label}: {unusable.map((t) => t.name).join(', ')}.
            </p>
          )}
          {usable.length > 1 && (
            <p className="text-caption text-text-secondary">A drop runs on one kind of setup. Have {gameName} on both PS5 and Xbox? Make one drop for each.</p>
          )}
          {tier && (
            <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface/60 p-3">
              <p className="text-body font-semibold text-text-primary">You have {tier.totalSeats} {tier.name}. How many have {gameName} and are kept for this drop?</p>
              <p className="text-caption text-text-secondary">Only count the ones with {gameName} installed. The rest stay open for normal bookings.</p>
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-1 rounded-xl border border-border bg-card p-1">
                  <button
                    type="button"
                    aria-label="One fewer"
                    disabled={daySeats <= 1}
                    onClick={() => setDaySeats((n) => Math.max(1, n - 1))}
                    className="flex h-11 w-11 items-center justify-center rounded-lg text-h3 font-bold text-text-primary hover:bg-surface disabled:opacity-40"
                  >
                    −
                  </button>
                  <span className="min-w-[3ch] text-center font-heading text-h3 font-bold text-text-primary" aria-live="polite">{daySeats}</span>
                  <button
                    type="button"
                    aria-label="One more"
                    disabled={daySeats >= tier.totalSeats}
                    onClick={() => setDaySeats((n) => Math.min(tier.totalSeats, n + 1))}
                    className="flex h-11 w-11 items-center justify-center rounded-lg text-h3 font-bold text-text-primary hover:bg-surface disabled:opacity-40"
                  >
                    +
                  </button>
                </div>
                {tier.totalSeats > 1 && daySeats !== tier.totalSeats && (
                  <button type="button" onClick={() => setDaySeats(tier.totalSeats)} className="h-11 rounded-xl border border-border px-4 text-body font-semibold text-text-primary hover:bg-surface">
                    All {tier.totalSeats}
                  </button>
                )}
              </div>
            </div>
          )}
        </Step>

        <Step n={3} title={`When are they kept for ${gameName}?`}>
          <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="When">
            <button
              type="button"
              role="radio"
              aria-checked={whole}
              disabled={!canWholeDay}
              onClick={() => setWholeDay(true)}
              className={`flex min-h-[64px] flex-col items-start justify-center rounded-xl border-2 px-3 text-left disabled:opacity-50 ${whole ? 'border-primary bg-primary/5' : 'border-border bg-card'}`}
            >
              <span className="font-semibold text-text-primary">The whole day</span>
              <span className="text-caption text-text-secondary">{!canWholeDay ? 'Set your opening hours first' : open24 ? 'All 24 hours, day and night' : `Every hour you’re open (${clock(openAt as string)} to ${clock(closeAt as string)})`}</span>
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={!whole}
              onClick={() => setWholeDay(false)}
              className={`flex min-h-[64px] flex-col items-start justify-center rounded-xl border-2 px-3 text-left ${!whole ? 'border-primary bg-primary/5' : 'border-border bg-card'}`}
            >
              <span className="font-semibold text-text-primary">Only some hours</span>
              <span className="text-caption text-text-secondary">The rest of the day stays open for normal play</span>
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <label className="col-span-2 flex flex-col gap-1 text-caption text-text-secondary sm:col-span-1">
              First day
              <input type="date" value={startsOn} min={new Date().toLocaleDateString('en-CA')} onChange={(e) => setStartsOn(e.target.value)} className={field} />
            </label>
            {!whole && (
              <>
                <label className="flex flex-col gap-1 text-caption text-text-secondary">
                  From
                  <input type="time" value={dayStart} onChange={(e) => setDayStart(e.target.value)} className={field} />
                </label>
                <label className="flex flex-col gap-1 text-caption text-text-secondary">
                  Until
                  <input type="time" value={dayEnd} onChange={(e) => setDayEnd(e.target.value)} className={field} />
                </label>
              </>
            )}
          </div>
          {!whole && dayEnd <= dayStart && (
            <p className="text-caption font-semibold text-text-primary">
              {dayEnd === dayStart ? 'Same time both sides: that is all 24 hours.' : `Runs past midnight: ${clock(dayStart)} to ${clock(dayEnd)} the next morning.`}
            </p>
          )}
          {tier && (
            <KeptPreview game={game || 'This game'} tierName={tier.name} total={tier.totalSeats} kept={daySeats} start={startT} end={endT} openAt={openAt} closeAt={closeAt} />
          )}
          {startsOn && Number(maxHours) > 0 && spanOf(startT, endT)[1] > 1440 && (
            <p className="rounded-lg bg-primary/5 px-3 py-2 text-caption font-semibold text-text-primary">
              Players can reserve from 12 AM on {shortDate(startsOn)}, so the first midnight is covered.
            </p>
          )}
          <p className="text-caption text-text-secondary">Nothing can be reserved before the first day. It runs for 2 weeks, then booking goes back to normal. Times are café time (India).</p>
        </Step>

        <Step n={4} title="Price">
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Price an hour (₹)"
              inputMode="numeric"
              value={price}
              onChange={(e) => setPrice(e.target.value.replace(/\D/g, ''))}
              hint={`Most cafés charge ${rupees(low)}–${rupees(high)}.`}
              error={priceNum && (priceNum < low || priceNum > high) ? `Suggested: ${rupees(low)}–${rupees(high)}` : undefined}
            />
            <Input
              label="Booking fee (₹)"
              inputMode="numeric"
              value={deposit}
              onChange={(e) => setDeposit(e.target.value.replace(/\D/g, ''))}
              hint="Paid online to hold a seat. Taken off the bill."
            />
          </div>
          <DropPriceOptions base={priceNum || 0} value={priceOpts} onChange={setPriceOpts} />
        </Step>

        <Step n={5} title="Your photo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {cover && <img src={cover} alt="Your drop photo" className="aspect-[16/9] w-full rounded-xl object-cover" />}
          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-xl bg-primary px-4 font-semibold text-white">
              <ImagePlus className="h-4 w-4" /> {uploading ? 'Uploading…' : cover ? 'Change photo' : 'Add a photo'}
              <input type="file" accept="image/*" className="hidden" disabled={uploading} onChange={(e) => upload(e.target.files?.[0])} />
            </label>
            {cover && (
              <button type="button" onClick={() => setCover('')} className="text-body font-semibold text-text-secondary underline">
                Remove photo
              </button>
            )}
          </div>
          <p className="text-caption text-text-secondary">A photo of people playing at your café works best. Without one, the Rockstar picture is shown.</p>
        </Step>

        <label className="flex items-center gap-2 text-body text-text-primary">
          <input type="checkbox" checked={live} onChange={(e) => setLive(e.target.checked)} className="h-5 w-5" />
          Put it live now (untick to keep it a draft only you can see)
        </label>

        <details className="rounded-xl border border-border p-3">
          <summary className="min-h-[44px] cursor-pointer list-none font-semibold text-text-primary">More options (you can skip these)</summary>
          <div className="mt-3 flex flex-col gap-3">
            <Input label="One line about it" value={tagline} onChange={(e) => setTagline(e.target.value)} placeholder="Play it on a PS5 and a big screen, launch week." />
            <div className="grid grid-cols-2 gap-3">
              <Input label="Booking fee for 4 or 5 hours (₹)" inputMode="numeric" value={depositLong} onChange={(e) => setDepositLong(e.target.value.replace(/\D/g, ''))} />
              <Input label="Longest stay (hours)" inputMode="numeric" value={maxHours} onChange={(e) => setMaxHours(e.target.value.replace(/\D/g, '').slice(0, 2))} />
            </div>
            <label className="flex flex-col gap-1.5 text-body font-medium text-text-primary">
              Everyone can reserve from (empty = now)
              <input type="datetime-local" value={publicAt} onChange={(e) => setPublicAt(e.target.value)} className="h-11 rounded-xl border border-border bg-card px-3 text-body" />
            </label>
            <label className="flex flex-col gap-1.5 text-body font-medium text-text-primary">
              Early access from
              <input type="datetime-local" value={earlyAt} onChange={(e) => setEarlyAt(e.target.value)} className="h-11 rounded-xl border border-border bg-card px-3 text-body" />
            </label>
            <Input label="Early access code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="KHELOGTA6" hint="Before everyone can reserve, only people with this code can." />
          </div>
        </details>

        {error && <p className="rounded-xl bg-error/10 px-3 py-2 text-body text-error">{error}</p>}
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button onClick={submit} disabled={busy || uploading} fullWidth className="sm:w-auto">
            {busy ? 'Saving…' : 'Save drop'}
          </Button>
          <Button variant="ghost" onClick={onCancel} fullWidth className="sm:w-auto">
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}


// Now, as the 'YYYY-MM-DDTHH:mm' text the date inputs use (café time).
function nowIst(): string {
  return new Date(Date.now() - 60_000).toLocaleString('sv-SE', { timeZone: 'Asia/Kolkata' }).replace(' ', 'T').slice(0, 16);
}
