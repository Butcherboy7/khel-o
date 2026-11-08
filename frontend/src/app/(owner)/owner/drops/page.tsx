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
  const [blocks, setBlocks] = useState<BlockRow[]>([{ date: '', startTime: '18:00', endTime: '23:00', seats: 4 }]);
  const [live, setLive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const priceNum = Number(price);
  const setBlock = (i: number, patch: Partial<BlockRow>) => setBlocks((bs) => bs.map((b, j) => (j === i ? { ...b, ...patch } : b)));

  const submit = async () => {
    setError(null);
    if (!cafeId || !title.trim() || !game.trim() || !publicAt) {
      setError('Fill in the café, title, game and when everyone can reserve.');
      return;
    }
    if (blocks.some((b) => !b.date || !b.startTime || !b.endTime || b.seats < 1)) {
      setError('Each time needs a date, a start, an end and at least 1 seat.');
      return;
    }
    if (blocks.some((b) => b.endTime <= b.startTime)) {
      setError('Each time has to end later the same day, before midnight.');
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
      earlyAccessStartsAt: istIso(earlyAt || publicAt),
      publicStartsAt: istIso(publicAt),
      status: live ? 'live' : 'draft',
      blocks,
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

        <div className="flex flex-col gap-2">
          <p className="text-body font-semibold text-text-primary">Times</p>
          <p className="text-caption text-text-secondary">Each time ends before midnight.</p>
          {blocks.map((b, i) => (
            <div key={i} className="grid grid-cols-2 gap-2 rounded-xl border border-border p-3 sm:grid-cols-[1.4fr_1fr_1fr_0.8fr_auto]">
              <label className="col-span-2 flex flex-col gap-1 text-caption text-text-secondary sm:col-span-1">
                Date
                <input type="date" value={b.date} onChange={(e) => setBlock(i, { date: e.target.value })} className="h-11 rounded-lg border border-border bg-card px-2 text-body text-text-primary" />
              </label>
              <label className="flex flex-col gap-1 text-caption text-text-secondary">
                Starts
                <input type="time" value={b.startTime} onChange={(e) => setBlock(i, { startTime: e.target.value })} className="h-11 rounded-lg border border-border bg-card px-2 text-body text-text-primary" />
              </label>
              <label className="flex flex-col gap-1 text-caption text-text-secondary">
                Ends
                <input type="time" value={b.endTime} onChange={(e) => setBlock(i, { endTime: e.target.value })} className="h-11 rounded-lg border border-border bg-card px-2 text-body text-text-primary" />
              </label>
              <label className="flex flex-col gap-1 text-caption text-text-secondary">
                Seats
                <input
                  type="number"
                  min={1}
                  value={b.seats}
                  onChange={(e) => setBlock(i, { seats: Math.max(1, Number(e.target.value) || 1) })}
                  className="h-11 rounded-lg border border-border bg-card px-2 text-body text-text-primary"
                />
              </label>
              <button
                type="button"
                aria-label="Remove this time"
                disabled={blocks.length === 1}
                onClick={() => setBlocks((bs) => bs.filter((_, j) => j !== i))}
                className="flex h-11 items-center justify-center self-end rounded-lg text-text-secondary hover:bg-surface disabled:opacity-30"
              >
                <Trash2 className="h-4 w-4" />
              </button>
              {b.date && b.endTime > b.startTime && (
                <p className="col-span-2 text-caption text-text-secondary sm:col-span-5">
                  {dayLabel(b.date)} · {blockTimes({ ...b, hours: hoursBetween(b.startTime, b.endTime) })} ·{' '}
                  {rupees(priceNum * hoursBetween(b.startTime, b.endTime))} a seat
                </p>
              )}
            </div>
          ))}
          <Button
            variant="secondary"
            onClick={() => setBlocks((bs) => [...bs, { ...bs[bs.length - 1], date: '' }])}
            className="self-start"
          >
            <Plus className="mr-1.5 h-4 w-4" /> Add a time
          </Button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-body font-medium text-text-primary">
            Everyone can reserve from
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

function hoursBetween(a: string, b: string): number {
  const m = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  return (m(b) - m(a)) / 60;
}
