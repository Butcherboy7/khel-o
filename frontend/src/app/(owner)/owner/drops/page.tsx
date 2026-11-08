'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, ExternalLink, Plus, Ticket, Trash2 } from 'lucide-react';
import { Button, Card, CardContent, EmptyState, Input, SkeletonCard } from '@/components/ui';
import { OwnerPageHeader } from '@/components/owner/OwnerPageHeader';
import { OwnerLoadError } from '@/components/owner/OwnerLoadError';
import { createDrop, listOwnerDrops, type NewDrop, type OwnerDropList } from '@/lib/api/drops';
import { blockTimes, dayLabel, rupees } from '@/lib/drops';

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
        title="Launch drops"
        description="Sell a few seats ahead of a big game launch. People pay a small deposit online and the rest at your café."
        action={
          !creating && (
            <Button onClick={() => setCreating(true)} fullWidth className="sm:w-auto">
              <Plus className="mr-1.5 h-4 w-4" /> New drop
            </Button>
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
      {data?.drops.map((d) => {
        const sold = d.seatsTotal - d.blocks.reduce((n, b) => n + b.seatsLeft, 0);
        return (
          <Card key={d.id} elevation="resting">
            <CardContent className="flex flex-col gap-3 p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-overline font-semibold uppercase tracking-wide text-primary">
                    {STATE_LABEL[d.state] ?? d.state} · {d.cafe.name}
                  </p>
                  <h2 className="font-heading text-h3 font-bold text-text-primary">{d.title}</h2>
                  <p className="text-body text-text-secondary">
                    {sold} of {d.seatsTotal} seats sold · {d.paidReservations} paid · {rupees(d.pricePerHour)} an hour
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

function NewDropForm({ list, onCancel, onCreated }: { list: OwnerDropList; onCancel: () => void; onCreated: () => void }) {
  const [low, high] = list.suggestedPrice;
  const [cafeId, setCafeId] = useState(list.cafes[0]?.id ?? '');
  const [title, setTitle] = useState('');
  const [game, setGame] = useState('');
  const [tagline, setTagline] = useState('');
  const [cover, setCover] = useState('');
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
  const [daySeats, setDaySeats] = useState(4);
  const [live, setLive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const priceNum = Number(price);

  const submit = async () => {
    setError(null);
    if (!cafeId || !title.trim() || !game.trim()) {
      setError('Fill in the café, title and game.');
      return;
    }
    if (!startsOn || !dayStart || !dayEnd || daySeats < 1) {
      setError('Set the first day, the opening and closing time, and the seats.');
      return;
    }
    if (dayEnd <= dayStart) {
      setError('It has to close later the same day, before midnight.');
      return;
    }
    const body: NewDrop = {
      cafeId,
      title: title.trim(),
      game: game.trim(),
      tagline: tagline.trim() || undefined,
      coverImageUrl: cover.trim() || undefined,
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

  return (
    <Card elevation="raised">
      <CardContent className="flex flex-col gap-4 p-5">
        <h2 className="font-heading text-h3 font-bold text-text-primary">New drop</h2>
        {list.cafes.length > 1 && (
          <label className="flex flex-col gap-1.5 text-body font-medium text-text-primary">
            Café
            <select
              value={cafeId}
              onChange={(e) => setCafeId(e.target.value)}
              className="h-11 rounded-xl border border-border bg-card px-3 text-body"
            >
              {list.cafes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="GTA 6 Launch Drop" />
        <Input label="Game" value={game} onChange={(e) => setGame(e.target.value)} placeholder="GTA 6" />
        <Input label="One line about it (optional)" value={tagline} onChange={(e) => setTagline(e.target.value)} placeholder="Play it on a PS5 and a big screen, launch week." />
        <Input
          label="Cover picture link (optional)"
          value={cover}
          onChange={(e) => setCover(e.target.value)}
          placeholder="https://…"
          hint="Use a photo of your café or your own art. Not official game art."
        />
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Price an hour (₹)"
            inputMode="numeric"
            value={price}
            onChange={(e) => setPrice(e.target.value.replace(/\D/g, ''))}
            hint={`Most cafés charge ${rupees(low)}–${rupees(high)} for a launch.`}
            error={priceNum && (priceNum < low || priceNum > high) ? `Suggested: ${rupees(low)}–${rupees(high)}` : undefined}
          />
          <Input
            label="Fee for 1 to 3 hours (₹)"
            inputMode="numeric"
            value={deposit}
            onChange={(e) => setDeposit(e.target.value.replace(/\D/g, ''))}
            hint="Paid online to hold the seat. Taken off the bill. Not refunded."
          />
          <Input
            label="Fee for 4 or 5 hours (₹)"
            inputMode="numeric"
            value={depositLong}
            onChange={(e) => setDepositLong(e.target.value.replace(/\D/g, ''))}
            hint="Same rules, for longer stays."
          />
          <Input
            label="Longest stay (hours)"
            inputMode="numeric"
            value={maxHours}
            onChange={(e) => setMaxHours(e.target.value.replace(/\D/g, '').slice(0, 2))}
            hint="People pick 1 up to this many hours. Leave empty to sell the whole time as one."
          />
        </div>

        <div className="flex flex-col gap-2 rounded-xl border border-border p-3">
          <p className="text-body font-semibold text-text-primary">Hours, every day</p>
          <p className="text-caption text-text-secondary">
            Set it once. Players see the next 7 days, and it adds a new day by itself each morning for 2 weeks. After that the drop ends and booking goes back to normal.
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <label className="col-span-2 flex flex-col gap-1 text-caption text-text-secondary sm:col-span-1">
              First day
              <input type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} className="h-11 rounded-lg border border-border bg-card px-2 text-body text-text-primary" />
            </label>
            <label className="flex flex-col gap-1 text-caption text-text-secondary">
              Opens
              <input type="time" value={dayStart} onChange={(e) => setDayStart(e.target.value)} className="h-11 rounded-lg border border-border bg-card px-2 text-body text-text-primary" />
            </label>
            <label className="flex flex-col gap-1 text-caption text-text-secondary">
              Closes
              <input type="time" value={dayEnd} onChange={(e) => setDayEnd(e.target.value)} className="h-11 rounded-lg border border-border bg-card px-2 text-body text-text-primary" />
            </label>
            <label className="flex flex-col gap-1 text-caption text-text-secondary">
              Seats at once
              <input type="number" min={1} value={daySeats} onChange={(e) => setDaySeats(Math.max(1, Number(e.target.value) || 1))} className="h-11 rounded-lg border border-border bg-card px-2 text-body text-text-primary" />
            </label>
          </div>
          {dayEnd > dayStart && <p className="text-caption text-text-secondary">{rupees(priceNum * hoursBetween(dayStart, dayEnd))} for a full day on one seat · Ends before midnight.</p>}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-body font-medium text-text-primary">
            Everyone can reserve from (empty = now)
            <input type="datetime-local" value={publicAt} onChange={(e) => setPublicAt(e.target.value)} className="h-11 rounded-xl border border-border bg-card px-3 text-body" />
          </label>
          <label className="flex flex-col gap-1.5 text-body font-medium text-text-primary">
            Early access from (optional)
            <input type="datetime-local" value={earlyAt} onChange={(e) => setEarlyAt(e.target.value)} className="h-11 rounded-xl border border-border bg-card px-3 text-body" />
          </label>
        </div>
        <Input
          label="Early access code (optional)"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="KHELOGTA6"
          hint="Before everyone can reserve, only people with this code can. Share it with your regulars."
        />
        <p className="text-caption text-text-secondary">Times are café time (India). No coupons or café offers work on drops.</p>

        <label className="flex items-center gap-2 text-body text-text-primary">
          <input type="checkbox" checked={live} onChange={(e) => setLive(e.target.checked)} className="h-5 w-5" />
          Put it live now (otherwise it stays a draft only you can see)
        </label>

        {error && <p className="rounded-xl bg-error/10 px-3 py-2 text-body text-error">{error}</p>}
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button onClick={submit} disabled={busy} fullWidth className="sm:w-auto">
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
