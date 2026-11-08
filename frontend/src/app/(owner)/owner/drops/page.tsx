'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, ExternalLink, ImagePlus, Plus, Ticket, Trash2 } from 'lucide-react';
import { Button, Card, CardContent, EmptyState, Input, SkeletonCard } from '@/components/ui';
import { OwnerPageHeader } from '@/components/owner/OwnerPageHeader';
import { OwnerLoadError } from '@/components/owner/OwnerLoadError';
import { createDrop, listOwnerDrops, type NewDrop, type OwnerDropList } from '@/lib/api/drops';
import { blockTimes, dayLabel, rupees } from '@/lib/drops';
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

type BlockRow = { date: string; startTime: string; endTime: string; seats: number };

export default function OwnerDropsPage() {
  const qc = useQueryClient();
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['owner', 'drops'], queryFn: listOwnerDrops });
  const [creating, setCreating] = useState(false);

  return (
    <div className="flex flex-col gap-6">
      <OwnerPageHeader
        guide="drops"
        title="Launch drops"
        description="Sell a few seats ahead of a big game launch. People reserve with a small deposit that comes off their bill, and pay the rest at your café."
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

      {creating && data && (
        <NewDropForm
          list={data}
          onCancel={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            qc.invalidateQueries({ queryKey: ['owner', 'drops'] });
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
                </div>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Link
                  href={`/owner/drops/${d.id}`}
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
  const [live, setLive] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const priceNum = Number(price);
  const tiers = list.cafes.find((c) => c.id === cafeId)?.tiers ?? [];
  const tier = tiers.find((t) => t.id === tierId) ?? null;
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
    if (!startsOn || !dayStart || !dayEnd || daySeats < 1) return setError('Set the first day, the hours and the seats.');
    if (dayEnd <= dayStart) return setError('It has to close later the same day, before midnight.');
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
      dailyStartTime: dayStart,
      dailyEndTime: dayEnd,
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

        <Step n={2} title="Which rig, and how many?">
          {tiers.length === 0 ? (
            <p className="rounded-xl bg-surface p-3 text-body text-text-secondary">
              You have no setups yet. <Link href="/owner/tiers" className="font-semibold text-primary">Add one in Setups &amp; prices</Link>, then come back.
            </p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Rig">
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
          {tier && (
            <>
              <label className="flex items-center justify-between gap-3 text-body font-medium text-text-primary">
                How many {tier.name} for this drop?
                <input
                  type="number"
                  min={1}
                  max={tier.totalSeats}
                  value={daySeats}
                  onChange={(e) => setDaySeats(Math.min(tier.totalSeats, Math.max(1, Number(e.target.value) || 1)))}
                  className={`${field} w-20 text-center`}
                />
              </label>
              <p className="rounded-xl border border-warning/40 bg-warning/10 p-3 text-caption text-text-primary">
                These {daySeats} {tier.name} are kept for the drop from {dayStart} to {dayEnd}, every day it runs. During those hours they show as
                taken for normal bookings. Outside those hours they are open for normal bookings again. Want them free for normal play? Make the drop hours shorter.
              </p>
            </>
          )}
        </Step>

        <Step n={3} title="When does it run?">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <label className="col-span-2 flex flex-col gap-1 text-caption text-text-secondary sm:col-span-1">
              First day
              <input type="date" value={startsOn} min={new Date().toLocaleDateString('en-CA')} onChange={(e) => setStartsOn(e.target.value)} className={field} />
            </label>
            <label className="flex flex-col gap-1 text-caption text-text-secondary">
              Opens
              <input type="time" value={dayStart} onChange={(e) => setDayStart(e.target.value)} className={field} />
            </label>
            <label className="flex flex-col gap-1 text-caption text-text-secondary">
              Closes
              <input type="time" value={dayEnd} onChange={(e) => setDayEnd(e.target.value)} className={field} />
            </label>
          </div>
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
              label="Fee to hold a seat (₹)"
              inputMode="numeric"
              value={deposit}
              onChange={(e) => setDeposit(e.target.value.replace(/\D/g, ''))}
              hint="Paid online. Taken off the bill."
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
              <Input label="Fee for 4 or 5 hours (₹)" inputMode="numeric" value={depositLong} onChange={(e) => setDepositLong(e.target.value.replace(/\D/g, ''))} />
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

function hoursBetween(a: string, b: string): number {
  const m = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  return (m(b) - m(a)) / 60;
}
