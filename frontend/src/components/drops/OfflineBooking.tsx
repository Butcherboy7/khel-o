'use client';

import { useMemo, useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { Button, Card, CardContent, Input } from '@/components/ui';
import { TimelineRangePicker } from '@/components/customer/TimelineRangePicker';
import { addOfflineBooking, removeOfflineBooking, type DropBlock, type OwnerDrop } from '@/lib/api/drops';
import { blockTimes, calDate, clock, clockRange, dayLabel, wireTime } from '@/lib/drops';
import { calculateWindowRemainingSeats, timeToMinutes } from '@/lib/format';

const digits = (v: string, max: number) => v.replace(/\D/g, '').slice(0, max);
const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
/** A clock time inside a session as minutes from its day's midnight (1 AM in a night session is 25:00). */
const inBlock = (t: string, b: DropBlock) => {
  const m = timeToMinutes(t);
  return m < timeToMinutes(b.startTime) ? m + 1440 : m;
};

/** Booked by phone, WhatsApp or cash at the counter: drag over the hours on the same slider
 *  players use and tap Mark as booked. Those hours turn red and the app stops selling them. */
export function OfflineBooking({ d, onDone }: { d: OwnerDrop; onDone: () => void }) {
  const open = d.blocks.filter((b) => b.seatsTotal > 0 && !b.started);
  const flexible = Boolean(d.maxHours);
  const [blockId, setBlockId] = useState('');
  const block = open.find((b) => b.id === blockId) ?? open[0];
  const [start, setStart] = useState('');
  const [hours, setHours] = useState(1);
  const [seats, setSeats] = useState(1);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const booked = useMemo(() => block?.bookedSlots ?? [], [block]);
  if (d.status === 'cancelled' || !block) return null;

  const s0 = start ? inBlock(start, block) : timeToMinutes(block.startTime);
  const startValue = hhmm(s0);
  const lengthMin = Math.round(hours * 60);
  const endValue = hhmm(s0 + lengthMin);
  const free = flexible ? calculateWindowRemainingSeats(block.seatsTotal, booked, s0, s0 + lengthMin) : block.seatsLeft;
  const n = Math.min(seats, Math.max(1, free));
  const sessionLen = timeToMinutes(block.endTime) - timeToMinutes(block.startTime);

  const pickDay = (b: DropBlock) => {
    setBlockId(b.id);
    setStart('');
    setHours(1);
    setMsg(null);
  };

  const save = async () => {
    setMsg(null);
    if (free < 1) {
      setMsg({ ok: false, text: 'Those hours are already full. Drag to other hours.' });
      return;
    }
    setBusy(true);
    try {
      await addOfflineBooking(d.id, {
        blockId: block.id,
        name: name.trim() || undefined,
        phone: phone.trim() || undefined,
        seats: n,
        startTime: flexible ? wireTime(startValue) : undefined,
        hours: flexible ? hours : undefined,
        amount: amount.trim() === '' ? undefined : Number(amount),
        note: note.trim() || undefined,
      });
      setMsg({
        ok: true,
        text: `Done. ${flexible ? clockRange(startValue, endValue) : blockTimes(block)} on ${dayLabel(calDate(block.date, startValue))} is booked for ${n} ${n === 1 ? 'seat' : 'seats'}. Players can't pick it now.`,
      });
      setName('');
      setPhone('');
      setAmount('');
      setNote('');
      onDone();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error)?.message || 'Couldn’t save it. Please try again.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card elevation="resting" data-tour="drop-offline">
      <CardContent className="flex flex-col gap-4 p-5">
        <div>
          <h2 className="font-heading text-h3 font-bold text-text-primary">Booked by phone or cash?</h2>
          <p className="text-body text-text-secondary">
            Pick the day, drag over the hours and tap Mark as booked. Those hours turn red and nobody can book them online.
          </p>
        </div>

        <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none]" role="radiogroup" aria-label="Day">
          {open.map((b) => {
            const shown = calDate(b.date, b.startTime);
            const twin = open.some((x) => x.id !== b.id && calDate(x.date, x.startTime) === shown);
            const on = b.id === block.id;
            const day = new Date(`${shown}T12:00:00+05:30`);
            return (
              <button
                key={b.id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => pickDay(b)}
                className={`min-h-[60px] w-[68px] flex-none rounded-xl border px-1 py-1.5 text-center transition-colors ${
                  on ? 'border-primary bg-primary/10' : 'border-border bg-card hover:border-primary/50'
                }`}
              >
                <span className="block text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
                  {day.toLocaleDateString('en-IN', { weekday: 'short', timeZone: 'Asia/Kolkata' })}
                </span>
                <span className="block font-heading text-body-emphasis font-bold leading-tight text-text-primary">
                  {day.toLocaleDateString('en-IN', { day: 'numeric', timeZone: 'Asia/Kolkata' })}
                </span>
                <span className={`block text-[11px] ${b.seatsLeft === 0 ? 'text-error' : 'text-text-secondary'}`}>
                  {b.seatsLeft === 0
                    ? 'Full'
                    : twin || shown !== b.date
                      ? clock(b.startTime)
                      : day.toLocaleDateString('en-IN', { month: 'short', timeZone: 'Asia/Kolkata' })}
                </span>
              </button>
            );
          })}
        </div>

        {flexible ? (
          <TimelineRangePicker
            key={block.id}
            openingTime={`${block.startTime}:00`}
            closingTime={`${block.endTime}:00`}
            selectedDate={block.date}
            startTime={startValue}
            durationHours={hours}
            onChange={(s, h) => {
              setStart(hhmm(inBlock(s.slice(0, 5), block)));
              setHours(h);
              setMsg(null);
            }}
            bookedSlots={booked}
            totalSeats={block.seatsTotal}
            requestedSeats={n}
            remainingSeats={free}
            skipCoachmark
            minDurationMinutes={60}
            maxDurationMinutes={Math.min(480, sessionLen)}
            stepMinutes={30}
          >
            <SeatStepper n={n} max={Math.max(1, free)} free={free} onChange={setSeats} />
          </TimelineRangePicker>
        ) : (
          <div className="rounded-2xl border border-border p-4">
            <p className="text-body text-text-secondary">{blockTimes(block)}</p>
            <SeatStepper n={n} max={Math.max(1, free)} free={free} onChange={setSeats} />
          </div>
        )}

        <details className="rounded-xl border border-border px-3">
          <summary className="flex min-h-[48px] cursor-pointer list-none items-center font-semibold text-text-primary">
            Add name, phone or cash (optional)
          </summary>
          <div className="flex flex-col gap-3 pb-3">
            <Input label="Customer name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Booked at the café" />
            <Input label="Phone" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value.replace(/[^\d+ ]/g, '').slice(0, 15))} />
            <Input label="Cash you collected (₹)" inputMode="numeric" value={amount} onChange={(e) => setAmount(digits(e.target.value, 7))} hint="Leave empty to use the usual price." />
            <Input label="Note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Booked on a call" />
          </div>
        </details>

        <div className="flex flex-col gap-2">
          <Button onClick={save} disabled={busy || free < 1} fullWidth className="bg-error hover:bg-error/90">
            {busy ? 'Saving…' : free < 1 ? 'Already full at this time' : `Mark as booked${flexible ? ` · ${clockRange(startValue, endValue)}` : ''}`}
          </Button>
          {msg && (
            <p className={`text-caption ${msg.ok ? 'text-success' : 'text-error'}`} role="status">
              {msg.text}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function SeatStepper({ n, max, free, onChange }: { n: number; max: number; free: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <div className="min-w-0">
        <span className="font-heading text-body font-bold text-text-primary">How many seats?</span>
        <p className="text-caption text-text-secondary">{free} free at this time</p>
      </div>
      <span className="flex items-center gap-3">
        <button
          type="button"
          aria-label="One seat less"
          onClick={() => onChange(Math.max(1, n - 1))}
          disabled={n <= 1}
          className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-card disabled:opacity-40"
        >
          <Minus className="h-4 w-4" />
        </button>
        <span className="w-6 text-center text-lg font-bold text-text-primary" aria-live="polite">
          {n}
        </span>
        <button
          type="button"
          aria-label="One seat more"
          onClick={() => onChange(Math.min(max, n + 1))}
          disabled={n >= max}
          className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-card disabled:opacity-40"
        >
          <Plus className="h-4 w-4" />
        </button>
      </span>
    </div>
  );
}

/** Two taps: Remove, then Yes. Frees the seats again. */
export function RemoveOffline({ id, name, onDone }: { id: string; name: string; onDone: () => void }) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!asking) {
    return (
      <span className="flex flex-col items-end gap-1">
        <Button variant="secondary" size="sm" onClick={() => setAsking(true)}>Remove</Button>
        {err && <span className="text-caption text-error">{err}</span>}
      </span>
    );
  }
  return (
    <span className="flex items-center gap-2">
      <span className="text-caption text-text-secondary">Free {name}’s seats?</span>
      <Button
        variant="primary"
        size="sm"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setErr(null);
          try {
            await removeOfflineBooking(id);
            onDone();
          } catch (e) {
            setErr((e as Error)?.message || 'Couldn’t remove it.');
            setAsking(false);
          } finally {
            setBusy(false);
          }
        }}
      >
        Yes
      </Button>
      <Button variant="secondary" size="sm" onClick={() => setAsking(false)}>Keep</Button>
    </span>
  );
}
