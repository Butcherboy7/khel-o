'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, ExternalLink, ImagePlus, Plus, Ticket } from 'lucide-react';
import { Button, Card, CardContent, EmptyState, Input, SkeletonCard } from '@/components/ui';
import { OwnerPageHeader } from '@/components/owner/OwnerPageHeader';
import { OwnerLoadError } from '@/components/owner/OwnerLoadError';
import { createDrop, listOwnerDrops, type NewDrop, type OwnerDropList } from '@/lib/api/drops';
import { rupees, shortDate } from '@/lib/drops';
import { uploadCafePhoto } from '@/lib/api/settings';

const STATE_LABEL: Record<string, string> = {
  draft: 'Draft (only you can see it)',
  cancelled: 'Cancelled',
  soon: 'Not open yet',
  early: 'Early access',
  open: 'Open to everyone',
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

  return (
    <div className="flex flex-col gap-6">
      <OwnerPageHeader
        guide={admin ? undefined : 'drops'}
        title="Launch drops"
        description={
          admin
            ? 'Set up and run a launch drop for any café. People reserve with a small booking fee that comes off their bill, and pay the rest at the café.'
            : 'Sell a few seats ahead of a big game launch. People reserve with a small booking fee that comes off their bill, and pay the rest at your café.'
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
          <span>New to GTA 6 reservations? Read the 2-minute guide, including how to add seats you sold at the café.</span>
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
          <Card key={d.id} elevation="resting" data-tour={i === 0 ? 'drops-list' : undefined}>
            <CardContent className="flex flex-col gap-3 p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-overline font-semibold uppercase tracking-wide text-primary">
                    {STATE_LABEL[d.state] ?? d.state} · {d.cafe.name}
                  </p>
                  <h2 className="font-heading text-h3 font-bold text-text-primary">{d.title}</h2>
                  <p className="text-body text-text-secondary">
                    {d.playsOn ? `On ${d.playsOn} · ` : ''}{sold} of {d.seatsTotal} seats sold · {d.paidReservations} paid · {rupees(d.pricePerHour)} an hour
                  </p>
                  {d.startsOn && d.endsOn && (
                    <p className="text-caption text-text-secondary">
                      {shortDate(d.startsOn)} to {shortDate(d.endsOn)}
                    </p>
                  )}
                  {extra?.[d.id] && (
                    <p className="text-caption text-text-secondary">
                      {rupees(extra[d.id].feesTaken)} in booking fees · {extra[d.id].waitlist} waiting
                      {extra[d.id].refunded > 0 ? ` · ${extra[d.id].refunded} refunded` : ''}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Link
                  href={`${base}/${d.id}`}
                  className="flex h-11 flex-1 items-center justify-center gap-1 rounded-xl bg-primary px-4 font-semibold text-white hover:bg-primary-dark"
                >
                  Reservations and check-in <ChevronRight className="h-4 w-4" />
                </Link>
                <a
                  href={`/drops/${d.slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-11 items-center justify-center gap-1.5 rounded-xl border border-border px-4 font-semibold text-text-primary hover:bg-surface"
                >
                  <ExternalLink className="h-4 w-4" /> Public page
                </a>
              </div>
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

/** Shows, in plain words and as a bar, what other players will see: how many of this system
 *  are kept for the drop, in which hours, and how many stay open for normal booking. */
function KeptPreview({ game, tierName, total, kept, start, end, openAt, closeAt }: {
  game: string; tierName: string; total: number; kept: number; start: string; end: string; openAt: string | null; closeAt: string | null;
}) {
  const rest = Math.max(0, total - kept);
  const lo = Math.min(mins(openAt ?? start), mins(start));
  const hi = Math.max(mins(closeAt ?? end), mins(end), lo + 60);
  const span = hi - lo;
  const left = Math.max(0, ((mins(start) - lo) / span) * 100);
  const width = Math.max(2, ((mins(end) - mins(start)) / span) * 100);
  const full = left < 0.5 && left + width > 99.5;
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-3" aria-live="polite">
      <p className="text-caption font-semibold uppercase tracking-wide text-text-secondary">What other players will see</p>
      <div className="relative h-8 overflow-hidden rounded-lg bg-success/15" role="img" aria-label={`${kept} of ${total} ${tierName} kept for ${game} from ${start} to ${end}`}>
        <div className="absolute inset-y-0 flex items-center justify-center bg-primary text-caption font-bold text-white" style={{ left: `${left}%`, width: `${width}%` }}>
          {game}
        </div>
      </div>
      <div className="flex justify-between text-caption text-text-secondary">
        <span>{openAt ?? start}</span>
        <span>{closeAt ?? end}</span>
      </div>
      <p className="text-body text-text-primary">
        From <strong>{start}</strong> to <strong>{end}</strong>, {kept} of your {total} {tierName} {kept === 1 ? 'is' : 'are'} kept for {game} and show as taken for normal booking.
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
  const tier = tiers.find((t) => t.id === tierId) ?? null;
  const cafeRow = list.cafes.find((c) => c.id === cafeId);
  const openAt = cafeRow?.openingTime ?? null;
  const closeAt = cafeRow?.closingTime ?? null;
  // "The whole day" = every hour the café is open. Only offered when the café's hours are set and end the same day.
  const canWholeDay = !!openAt && !!closeAt && closeAt > openAt;
  const whole = wholeDay && canWholeDay;
  const startT = whole ? (openAt as string) : dayStart;
  const endT = whole ? (closeAt as string) : dayEnd;
  const pickTier = (id: string) => {
    setTierId(id);
    const t = tiers.find((x) => x.id === id);
    if (t) setDaySeats((n) => Math.min(Math.max(1, n), t.totalSeats));
  };

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
    if (!tier) return setError('Pick which of your rigs this drop runs on.');
    if (!startsOn || !startT || !endT || daySeats < 1) return setError('Set the first day, the hours and the seats.');
    if (endT <= startT) return setError('It has to close later the same day, before midnight.');
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

        <Step n={2} title={`Which of your systems run ${game || 'it'}?`}>
          {tiers.length === 0 ? (
            <p className="rounded-xl bg-surface p-3 text-body text-text-secondary">
              You have no setups yet. <Link href="/owner/tiers" className="font-semibold text-primary">Add one in Setups &amp; prices</Link>, then come back.
            </p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="System">
              {tiers.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="radio"
                  aria-checked={t.id === tierId}
                  onClick={() => pickTier(t.id)}
                  className={`flex min-h-[56px] items-center justify-between gap-3 rounded-xl border-2 px-3 text-left ${t.id === tierId ? 'border-primary bg-primary/5' : 'border-border bg-card'}`}
                >
                  <span className="font-semibold text-text-primary">{t.name}</span>
                  <span className="text-caption text-text-secondary">you have {t.totalSeats}</span>
                </button>
              ))}
            </div>
          )}
          <p className="text-caption text-text-secondary">A drop runs on one kind of system. Want {game || 'it'} on both PS5 and Xbox? Make one drop for each.</p>
          {tier && (
            <div className="flex flex-col gap-2">
              <p className="text-body font-medium text-text-primary">How many of your {tier.totalSeats} {tier.name} run {game || 'it'}?</p>
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

        <Step n={3} title={`When are they kept for ${game || 'it'}?`}>
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
              <span className="text-caption text-text-secondary">{canWholeDay ? `Every hour you’re open (${openAt}–${closeAt})` : 'Set your opening hours first'}</span>
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
          {tier && (
            <KeptPreview game={game || 'This game'} tierName={tier.name} total={tier.totalSeats} kept={daySeats} start={startT} end={endT} openAt={openAt} closeAt={closeAt} />
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
