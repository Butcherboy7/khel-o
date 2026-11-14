'use client';

import { useEffect, useMemo, useState } from 'react';
import { Ban, CalendarDays, Check, Copy, IndianRupee, Minus, Plus, RotateCcw, Users, X } from 'lucide-react';
import { Button, Card, CardContent, Input } from '@/components/ui';
import { TimelineRangePicker } from '@/components/customer/TimelineRangePicker';
import { RemoveOffline } from '@/components/drops/OfflineBooking';
import { ConsolePicker, ConsoleStrip, pickedLabel, type ConsoleState } from '@/components/drops/ConsolePicker';
import {
  addOfflineBooking,
  removeOfflineBooking,
  setDropSchedule,
  updateDrop,
  type DropBlock,
  type OpenHours,
  type OwnerDrop,
  type TimePrice,
} from '@/lib/api/drops';
import { calDate, clock, clockRange, dayLabel, dropSeatPrice, minutesOf, paintBands, rupees, shortDate, wireTime } from '@/lib/drops';
import { calculateWindowRemainingSeats } from '@/lib/format';

type Mode = 'walkin' | 'block' | 'price';
type Undo = { label: string; run: () => Promise<unknown> };

const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
const iso = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
const addDays = (date: string, n: number) => iso(new Date(new Date(`${date}T12:00:00+05:30`).getTime() + n * 86_400_000));
const todayIso = () => iso(new Date());
/** A clock time inside a session as minutes from its day's midnight (1 AM in a night session is 25:00). */
const inBlock = (t: string, b: DropBlock) => {
  const m = minutesOf(t);
  return m < minutesOf(b.startTime) ? m + 1440 : m;
};
const hrs = (min: number) => {
  const h = min / 60;
  return `${Number.isInteger(h) ? h : h.toFixed(1)} ${h === 1 ? 'hr' : 'hrs'}`;
};

const MODES: { id: Mode; label: string; hint: string; icon: typeof Users; on: string }[] = [
  { id: 'walkin', label: 'Walk-in', hint: 'Sold at the café, by phone or cash', icon: Users, on: 'border-violet-500 bg-violet-50 text-violet-800' },
  { id: 'block', label: 'Block', hint: 'Not for sale (cleaning, private use)', icon: Ban, on: 'border-gray-500 bg-gray-100 text-gray-800' },
  { id: 'price', label: 'Price', hint: 'A different price for these hours', icon: IndianRupee, on: 'border-sky-500 bg-sky-50 text-sky-800' },
];

/** The café's one screen for its event days: pick a day, drag over the hours on the same slider
 *  players use, then say what they are (sold to a walk-in, blocked, or a different price).
 *  Opening hours per day, copy a day to other days, and how far ahead people can book. */
export function SlotManager({ d, onDone }: { d: OwnerDrop; onDone: () => void }) {
  const flexible = Boolean(d.maxHours);
  const today = todayIso();

  // Every event date from today: the ones with sessions, closed ones, and ones not opened yet.
  const dates = useMemo(() => {
    const set = new Set(d.blocks.map((b) => b.date));
    if (d.startsOn) {
      const last = d.endsOn ?? d.startsOn;
      for (let x = d.startsOn; x <= last; x = addDays(x, 1)) set.add(x);
    }
    return Array.from(set).filter((x) => x >= addDays(today, -1)).sort();
  }, [d.blocks, d.startsOn, d.endsOn, today]);

  const [date, setDate] = useState('');
  const day = dates.includes(date) ? date : dates.find((x) => d.blocks.some((b) => b.date === x && !b.started)) ?? dates[0];
  const sessions = d.blocks.filter((b) => b.date === day && b.seatsTotal > 0);
  const [blockId, setBlockId] = useState('');
  const block = sessions.find((b) => b.id === blockId) ?? sessions.find((b) => !b.started) ?? sessions[0];
  const isEve = Boolean(d.startsOn && day < d.startsOn);
  const isClosed = Boolean(d.dayHours && d.dayHours[day] && d.dayHours[day].length === 0);

  const [mode, setMode] = useState<Mode>('walkin');
  const [start, setStart] = useState('');
  const [hours, setHours] = useState(1);
  const [seats, setSeats] = useState(1);
  const [rate, setRate] = useState('');
  const [minH, setMinH] = useState(1);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [undo, setUndo] = useState<Undo | null>(null);

  // Which consoles the café is working on: [] = all of them (the overview).
  const consoles = useMemo(() => d.consoles ?? [], [d.consoles]);
  const [pick, setPick] = useState<string[]>([]);
  const picked = pick.filter((k) => consoles.some((c) => c.key === k));
  /** Bookings as the slider should see them: only the picked consoles, when some are picked. */
  const forPick = (slots: NonNullable<DropBlock['bookedSlots']>) =>
    picked.length
      ? slots
          .map((s) => ({ ...s, seatsCount: (s.units ?? []).filter((u) => picked.includes(u)).length }))
          .filter((s) => s.seatsCount > 0)
      : slots;
  const capOf = (b: DropBlock) => (picked.length ? picked.length : b.seatsTotal);

  const booked = useMemo(() => forPick(block?.bookedSlots ?? []), [block, picked.join()]); // eslint-disable-line react-hooks/exhaustive-deps
  const bands = useMemo(() => block?.timePrices ?? d.dayPrices?.[day] ?? d.timePrices ?? [], [block, d.dayPrices, d.timePrices, day]);
  const sessionLen = block ? minutesOf(block.endTime) - minutesOf(block.startTime) : 0;
  const s0 = block ? (start ? inBlock(start, block) : minutesOf(block.startTime)) : 0;
  const lengthMin = Math.min(Math.round(hours * 60), Math.max(60, sessionLen));
  const e0 = s0 + lengthMin;
  const startValue = hhmm(s0);
  const endValue = hhmm(e0);
  const total = block ? capOf(block) : 0;
  const free = block ? calculateWindowRemainingSeats(total, booked, s0, e0) : 0;
  const n = Math.min(seats, Math.max(1, free));

  // What each console is doing at the picked hours.
  const states = useMemo(() => {
    const out: Record<string, ConsoleState> = {};
    for (const s of block?.bookedSlots ?? []) {
      if (!(minutesOf(s.startTime) < e0 && s0 < minutesOf(s.endTime))) continue;
      for (const u of s.units ?? []) out[u] ??= s.kind ?? 'online';
    }
    return out;
  }, [block, s0, e0]);
  const busyPicked = picked.filter((k) => (states[k] ?? 'free') !== 'free');
  const pickName = pickedLabel(consoles, picked);
  const priced = { ...d, timePrices: bands };
  const usualRate = (bands.find((b) => {
    const bs = minutesOf(b.start);
    let be = minutesOf(b.end);
    if (be <= bs) be += 1440;
    const m = s0 % 1440;
    return (m >= bs && m < be) || (m + 1440 >= bs && m + 1440 < be);
  })?.perHour ?? d.pricePerHour);

  useEffect(() => {
    setAsking(false);
    setMsg(null);
  }, [day, blockId, mode, start, hours, pick]);

  const pickDay = (x: string) => {
    setDate(x);
    setBlockId('');
    setStart('');
    setHours(1);
    setUndo(null);
  };

  const run = async (fn: () => Promise<unknown>, done: string, u?: Undo) => {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      setMsg({ ok: true, text: done });
      setUndo(u ?? null);
      setAsking(false);
      onDone();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error)?.message || 'Couldn’t save it. Please try again.' });
    } finally {
      setBusy(false);
    }
  };

  const range = clockRange(startValue, endValue);
  const when = `${dayLabel(calDate(day, startValue))}, ${range}`;

  const markSeats = (kind: 'walkin' | 'block') =>
    run(
      async () => {
        const r = await addOfflineBooking(d.id, {
          blockId: block!.id,
          seats: picked.length ? picked.length : kind === 'block' ? free : n,
          units: picked.length ? picked : undefined,
          startTime: flexible ? wireTime(startValue) : undefined,
          hours: flexible ? lengthMin / 60 : undefined,
          kind,
          name: kind === 'walkin' ? name.trim() || undefined : undefined,
          phone: kind === 'walkin' ? phone.trim() || undefined : undefined,
          amount: kind === 'walkin' && amount.trim() !== '' ? Number(amount) : undefined,
          note: note.trim() || undefined,
        });
        setName('');
        setPhone('');
        setAmount('');
        setNote('');
        setUndoId(r.id);
      },
      kind === 'block'
        ? `Blocked ${picked.length ? pickName : 'all free consoles'}, ${when}. Nobody can book ${picked.length === 1 ? 'it' : 'them'} online.`
        : `Marked ${picked.length ? pickName : `${n} ${n === 1 ? 'console' : 'consoles'}`} as sold, ${when}. Players can’t pick ${picked.length === 1 || n === 1 ? 'it' : 'them'} now.`,
    );
  const whatWillHappen = (kind: 'walkin' | 'block') => {
    const who = picked.length ? pickName : kind === 'block' ? `all ${free} free ${free === 1 ? 'console' : 'consoles'}` : `${n} ${n === 1 ? 'console' : 'consoles'}`;
    return kind === 'block'
      ? `Block ${who}, ${when}? Nobody can book ${picked.length === 1 || (!picked.length && free === 1) ? 'it' : 'them'} online.`
      : `Mark ${who} as sold to a walk-in, ${when}? The other consoles stay open.`;
  };

  // The new booking's id arrives inside run(); keep it for Undo.
  const [undoId, setUndoId] = useState<string | null>(null);
  useEffect(() => {
    if (!undoId) return;
    setUndo({ label: 'Undo', run: () => removeOfflineBooking(undoId) });
    setUndoId(null);
  }, [undoId]);

  const setPrice = (perHour: number | null) => {
    const before = d.dayPrices?.[day];
    const next = paintBands(bands, s0, e0, perHour, perHour ? minH : undefined);
    return run(
      () => setDropSchedule(d.id, { dates: [day], prices: next }),
      perHour ? `From ${range} on ${shortDate(day)}: ${rupees(perHour)} an hour${minH > 1 ? `, at least ${minH} hours` : ''}.` : `${range} on ${shortDate(day)} is back to the usual price.`,
      {
        label: 'Undo',
        run: () => setDropSchedule(d.id, before === undefined ? { dates: [day], useDefaultPrices: true } : { dates: [day], prices: before }),
      },
    );
  };

  // Day summary, in seat-hours (just hours on a one-seat rig).
  const summary = useMemo(() => {
    const out = { free: 0, online: 0, walkin: 0, blocked: 0, open: 0 };
    for (const b of sessions) {
      const a = minutesOf(b.startTime);
      const z = minutesOf(b.endTime);
      for (let m = a; m < z; m += 30) {
        let used = 0;
        for (const s of forPick(b.bookedSlots ?? [])) {
          const ss = minutesOf(s.startTime);
          const se = minutesOf(s.endTime);
          if (m >= ss && m < se) {
            used += s.seatsCount;
            out[s.kind ?? 'online'] += (s.seatsCount * 30) / 60;
          }
        }
        out.free += (Math.max(0, capOf(b) - used) * 30) / 60;
        out.open += 0.5;
      }
    }
    return out;
  }, [sessions, picked.join()]); // eslint-disable-line react-hooks/exhaustive-deps
  const many = (picked.length || (d.seatsPerSlot ?? 1)) > 1;
  const labelOf = (k: string) => consoles.find((c) => c.key === k)?.label ?? '';
  const onDay = sessions.flatMap((b) =>
    (b.bookedSlots ?? []).filter((s) => s.kind && s.kind !== 'online' && s.id && (!picked.length || (s.units ?? []).some((u) => picked.includes(u)))),
  );

  if (d.status === 'cancelled' || !dates.length) return null;

  const startOptions: number[] = [];
  if (block) for (let m = minutesOf(block.startTime); m <= minutesOf(block.endTime) - 60; m += 30) startOptions.push(m);
  const lengthOptions: number[] = [];
  if (block) for (let m = 60; m <= Math.min(480, minutesOf(block.endTime) - s0); m += 30) lengthOptions.push(m);

  const takenText = busyPicked.length ? `${pickedLabel(consoles, busyPicked)} ${busyPicked.length === 1 ? 'is' : 'are'} taken then` : '';
  const actionDisabled = busy || !block || block.started || (mode !== 'price' && (picked.length ? busyPicked.length > 0 : free < 1));

  return (
    <Card elevation="resting" data-tour="drop-offline">
      <CardContent className="flex flex-col gap-3 p-4 sm:p-5">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="font-heading text-h3 font-bold text-text-primary">Manage slots</h2>
          <p className="truncate text-caption text-text-secondary">Pick a day, drag the hours</p>
        </div>

        {/* Days */}
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:-mx-5 sm:px-5 [scrollbar-width:none]" role="radiogroup" aria-label="Day">
          {dates.map((x) => {
            const own = d.blocks.filter((b) => b.date === x && b.seatsTotal > 0);
            const shown = own[0] ? calDate(x, own[0].startTime) : x;
            const closed = Boolean(d.dayHours?.[x] && d.dayHours[x].length === 0);
            const later = !own.length && !closed;
            const full = own.length > 0 && own.every((b) => b.seatsLeft === 0);
            const on = x === day;
            const dd = new Date(`${shown}T12:00:00+05:30`);
            return (
              <button
                key={x}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => pickDay(x)}
                className={`min-h-[52px] w-[58px] flex-none rounded-xl border px-1 py-1 text-center transition-colors ${
                  on ? 'border-primary bg-primary/10' : 'border-border bg-card hover:border-primary/50'
                } ${closed ? 'opacity-70' : ''}`}
              >
                <span className="block text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
                  {dd.toLocaleDateString('en-IN', { weekday: 'short', timeZone: 'Asia/Kolkata' })}
                </span>
                <span className="block font-heading text-body-emphasis font-bold leading-tight text-text-primary">
                  {dd.toLocaleDateString('en-IN', { day: 'numeric', timeZone: 'Asia/Kolkata' })}
                </span>
                <span className={`block text-[11px] ${closed || full ? 'font-semibold text-error' : 'text-text-secondary'}`}>
                  {closed ? 'Closed' : full ? 'Full' : later ? 'Soon' : shown !== x ? clock(own[0].startTime) : dd.toLocaleDateString('en-IN', { month: 'short', timeZone: 'Asia/Kolkata' })}
                </span>
              </button>
            );
          })}
        </div>

        {/* Which console(s): all, one, or several */}
        {consoles.length > 1 && mode !== 'price' && (
          <ConsolePicker consoles={consoles} value={picked} onChange={setPick} states={states} when={block ? `at ${range}` : 'on this day'} />
        )}

        {/* What the day looks like */}
        {sessions.length > 0 && (
          <dl
            className="flex flex-wrap items-center gap-x-3 gap-y-1 text-caption tabular-nums"
            aria-label={`${dayLabel(day)} at a glance${many ? `, hours added up across ${picked.length ? pickName : `all ${consoles.length || d.seatsPerSlot} consoles`}` : ''}`}
            title={many ? `Hours added up across ${picked.length ? pickName : `all ${consoles.length || d.seatsPerSlot} consoles`}` : undefined}
          >
            {[
              ['free', summary.free, 'bg-green-500', 'text-green-800'],
              ['online', summary.online, 'bg-red-500', 'text-red-700'],
              ['walk-in', summary.walkin, 'bg-violet-500', 'text-violet-800'],
              ['blocked', summary.blocked, 'bg-gray-400', 'text-gray-700'],
            ].map(([label, v, dot, txt]) => (
              <div key={label as string} className="flex items-center gap-1">
                <span className={`h-2 w-2 rounded-full ${dot}`} aria-hidden />
                <dd className={`font-bold ${txt}`}>{Number.isInteger(v as number) ? (v as number) : (v as number).toFixed(1)} hrs</dd>
                <dt className="text-text-secondary">{label as string}</dt>
              </div>
            ))}
          </dl>
        )}

        {!block ? (
          <div className="flex flex-col items-start gap-2 rounded-2xl border border-dashed border-border p-4">
            <p className="font-semibold text-text-primary">
              {isClosed ? `Closed on ${dayLabel(day)}` : `${dayLabel(day)} opens for booking a week before`}
            </p>
            <p className="text-caption text-text-secondary">
              {isClosed ? 'Nobody can book this day. Open it again below.' : 'You can already change its hours and prices below.'}
            </p>
          </div>
        ) : (
          <>
            {sessions.length > 1 && (
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Opening">
                {sessions.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    role="radio"
                    aria-checked={b.id === block.id}
                    onClick={() => {
                      setBlockId(b.id);
                      setStart('');
                    }}
                    className={`min-h-[44px] rounded-full border px-3 text-caption font-semibold ${
                      b.id === block.id ? 'border-primary bg-primary/10 text-text-primary' : 'border-border bg-card text-text-secondary'
                    }`}
                  >
                    {clockRange(b.startTime, b.endTime)}
                  </button>
                ))}
              </div>
            )}

            {/* What to do with the hours */}
            <div className="grid grid-cols-3 gap-1 rounded-xl border border-border bg-surface p-1" role="radiogroup" aria-label="What are these hours?">
              {MODES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  role="radio"
                  aria-checked={mode === m.id}
                  onClick={() => setMode(m.id)}
                  className={`flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg border px-1 text-center transition-colors ${
                    mode === m.id ? m.on : 'border-transparent text-text-secondary hover:text-text-primary'
                  }`}
                >
                  <m.icon className="h-4 w-4" aria-hidden />
                  <span className="text-caption font-bold">{m.label}</span>
                </button>
              ))}
            </div>
            <p className="-mt-1.5 text-caption text-text-secondary">
              {MODES.find((m) => m.id === mode)?.hint}
              {mode === 'price' && consoles.length > 1 ? '. Applies to every console.' : ''}
            </p>

            {/* Every console at the picked hours (the overview); tap one to work on it alone */}
            {consoles.length > 1 && mode !== 'price' && !picked.length && (
              <div className="flex flex-col gap-1.5">
                <p className="text-caption text-text-secondary">
                  <span className="font-semibold text-text-primary">{range}</span> · {consoles.length - Object.keys(states).filter((k) => consoles.some((c) => c.key === k)).length} of{' '}
                  {consoles.length} free. Tap one to pick it.
                </p>
                <ConsoleStrip consoles={consoles} states={states} onPick={(k) => setPick([k])} />
              </div>
            )}

            {flexible ? (
              <TimelineRangePicker
                key={block.id}
                openingTime={`${block.startTime}:00`}
                closingTime={`${block.endTime}:00`}
                selectedDate={block.date}
                startTime={startValue}
                durationHours={lengthMin / 60}
                onChange={(s, h) => {
                  setStart(hhmm(inBlock(s.slice(0, 5), block)));
                  setHours(h);
                }}
                bookedSlots={booked}
                totalSeats={total}
                requestedSeats={mode === 'price' ? 0 : n}
                remainingSeats={free}
                skipCoachmark
                minDurationMinutes={60}
                maxDurationMinutes={Math.min(480, sessionLen)}
                stepMinutes={30}
                ownerView
                priceBands={bands}
              >
                {mode !== 'price' && picked.length > 0 && (
                  <p className={`py-1.5 text-caption ${busyPicked.length ? 'font-semibold text-error' : 'text-text-secondary'}`}>
                    {busyPicked.length ? `${takenText}. Move the hours or pick another console.` : `${pickName} ${picked.length === 1 ? 'is' : 'are'} free in these hours.`}
                  </p>
                )}
                {mode === 'walkin' && !picked.length && <SeatStepper n={n} max={Math.max(1, free)} free={free} onChange={setSeats} />}
                {mode === 'block' && !picked.length && (
                  <p className="py-1.5 text-caption text-text-secondary">
                    Blocks all {free} free {free === 1 ? 'console' : 'consoles'} in these hours. To close the whole drop, pick every console.
                  </p>
                )}
                {mode === 'price' && (
                  <div className="grid grid-cols-2 gap-2 py-1.5">
                    <label className="flex min-w-0 flex-col gap-1 text-caption text-text-secondary">
                      Price an hour
                      <span className="relative">
                        <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-text-secondary">₹</span>
                        <input
                          inputMode="numeric"
                          value={rate}
                          placeholder={String(usualRate)}
                          onChange={(e) => setRate(e.target.value.replace(/\D/g, '').slice(0, 5))}
                          className="h-11 w-full min-w-0 rounded-lg border border-border bg-card pl-6 pr-2 text-body tabular-nums text-text-primary"
                        />
                      </span>
                    </label>
                    <label className="flex min-w-0 flex-col gap-1 text-caption text-text-secondary">
                      Shortest booking
                      <select
                        value={minH}
                        onChange={(e) => setMinH(Number(e.target.value))}
                        className="h-11 w-full min-w-0 rounded-lg border border-border bg-card px-2 text-body text-text-primary"
                      >
                        {[1, 2, 3, 4, 5, 6].map((h) => (
                          <option key={h} value={h}>
                            {h} {h === 1 ? 'hour' : 'hours'}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                )}
              </TimelineRangePicker>
            ) : (
              <div className="rounded-2xl border border-border p-4">
                <p className="text-body text-text-secondary">{clockRange(block.startTime, block.endTime)}</p>
                {!picked.length && <SeatStepper n={n} max={Math.max(1, free)} free={free} onChange={setSeats} />}
              </div>
            )}

            {/* The same choice without dragging */}
            {flexible && (
              <div className="grid grid-cols-2 gap-2">
                <label className="flex min-w-0 flex-col gap-1 text-caption text-text-secondary">
                  From
                  <select
                    value={s0}
                    onChange={(e) => {
                      const m = Number(e.target.value);
                      setStart(hhmm(m));
                      setHours(Math.min(hours, (minutesOf(block.endTime) - m) / 60));
                    }}
                    className="h-11 w-full min-w-0 rounded-lg border border-border bg-card px-2 text-body text-text-primary"
                  >
                    {startOptions.map((m) => (
                      <option key={m} value={m}>
                        {clock(hhmm(m))}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex min-w-0 flex-col gap-1 text-caption text-text-secondary">
                  For
                  <select
                    value={lengthMin}
                    onChange={(e) => setHours(Number(e.target.value) / 60)}
                    className="h-11 w-full min-w-0 rounded-lg border border-border bg-card px-2 text-body text-text-primary"
                  >
                    {lengthOptions.map((m) => (
                      <option key={m} value={m}>
                        {hrs(m)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}

            {/* What you picked */}
            <div className="rounded-xl bg-surface-hover px-3 py-2.5 text-caption text-text-secondary">
              <p className="font-heading text-body-emphasis font-bold text-text-primary">{when}</p>
              <p>
                {picked.length ? `${pickName} · ` : ''}
                {hrs(lengthMin)} · {free} of {total} {total === 1 ? 'console' : 'consoles'} free · players pay{' '}
                {rupees(dropSeatPrice(priced, s0, lengthMin / 60))} a seat
              </p>
            </div>

            {mode === 'walkin' && (
              <details className="rounded-xl border border-border px-3">
                <summary className="flex min-h-[48px] cursor-pointer list-none items-center font-semibold text-text-primary">
                  Add name, phone or cash (optional)
                </summary>
                <div className="flex flex-col gap-3 pb-3">
                  <Input label="Customer name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Booked at the café" />
                  <Input label="Phone" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value.replace(/[^\d+ ]/g, '').slice(0, 15))} />
                  <Input
                    label="Cash you collected (₹)"
                    inputMode="numeric"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value.replace(/\D/g, '').slice(0, 7))}
                    hint="Leave empty to use the usual price."
                  />
                  <Input label="Note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Booked on a call" />
                </div>
              </details>
            )}
            {mode === 'block' && <Input label="Reason (optional)" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Cleaning, private event" />}

            {/* Do it */}
            <div className="flex flex-col gap-2">
              {(mode === 'walkin' || mode === 'block') &&
                (asking ? (
                  <div className={`flex flex-col gap-2 rounded-xl border p-3 ${mode === 'walkin' ? 'border-violet-300 bg-violet-50' : 'border-gray-300 bg-gray-100'}`}>
                    <p className={`text-caption ${mode === 'walkin' ? 'text-violet-900' : 'text-gray-800'}`}>{whatWillHappen(mode)}</p>
                    <div className="flex gap-2">
                      <Button
                        onClick={() => markSeats(mode)}
                        disabled={busy}
                        className={`flex-1 ${mode === 'walkin' ? 'bg-violet-600 hover:bg-violet-700' : 'bg-gray-700 hover:bg-gray-800'}`}
                      >
                        <Check className="h-4 w-4" /> {busy ? 'Saving…' : mode === 'walkin' ? 'Yes, mark as sold' : 'Yes, block it'}
                      </Button>
                      <Button variant="secondary" onClick={() => setAsking(false)}>
                        Back
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    onClick={() => setAsking(true)}
                    disabled={actionDisabled}
                    fullWidth
                    className={mode === 'walkin' ? 'bg-violet-600 hover:bg-violet-700' : 'bg-gray-700 hover:bg-gray-800'}
                  >
                    {busy
                      ? 'Saving…'
                      : picked.length && busyPicked.length
                        ? takenText
                        : !picked.length && free < 1
                          ? mode === 'walkin'
                            ? 'Already full at this time'
                            : 'Nothing free to block here'
                          : mode === 'walkin'
                            ? `Mark ${picked.length ? `${pickName} as` : 'as'} sold · ${range}`
                            : `Block ${picked.length ? `${pickName} · ` : ''}${range}`}
                  </Button>
                ))}
              {mode === 'price' &&
                (asking ? (
                  <div className="flex flex-col gap-2 rounded-xl border border-sky-300 bg-sky-50 p-3">
                    <p className="text-caption text-sky-900">
                      Players starting {range} on {shortDate(day)} pay {rupees(Number(rate))} an hour
                      {minH > 1 ? ` and book at least ${minH} hours` : ''}. Bookings already made keep their price.
                    </p>
                    <div className="flex gap-2">
                      <Button onClick={() => setPrice(Number(rate))} disabled={busy} className="flex-1 bg-sky-600 hover:bg-sky-700">
                        <Check className="h-4 w-4" /> {busy ? 'Saving…' : 'Yes, set it'}
                      </Button>
                      <Button variant="secondary" onClick={() => setAsking(false)}>
                        Back
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button onClick={() => setAsking(true)} disabled={busy || !Number(rate)} fullWidth className="bg-sky-600 hover:bg-sky-700">
                      {Number(rate) ? `Set ${rupees(Number(rate))} an hour · ${range}` : 'Type a price first'}
                    </Button>
                    <Button variant="secondary" onClick={() => setPrice(null)} disabled={busy}>
                      Back to usual price
                    </Button>
                  </div>
                ))}
              {msg && (
                <div
                  role="status"
                  className={`flex items-start justify-between gap-3 rounded-lg px-3 py-2 text-caption ${msg.ok ? 'bg-success/10 text-success' : 'bg-error/10 text-error'}`}
                >
                  <span className="min-w-0">{msg.text}</span>
                  {msg.ok && undo && (
                    <button
                      type="button"
                      className="inline-flex min-h-[32px] flex-none items-center gap-1 font-bold underline"
                      onClick={() => {
                        const u = undo;
                        setUndo(null);
                        run(u.run, 'Undone.');
                      }}
                    >
                      <RotateCcw className="h-3.5 w-3.5" /> {undo.label}
                    </button>
                  )}
                </div>
              )}
            </div>
          </>
        )}

        {/* Walk-ins and blocks on this day */}
        {onDay.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <p className="text-caption font-semibold uppercase tracking-wide text-text-secondary">On {dayLabel(day)}</p>
            {onDay.map((s) => (
              <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2">
                <span className="flex min-w-0 items-center gap-2 text-caption">
                  <span className={`h-2.5 w-2.5 flex-none rounded-full ${s.kind === 'walkin' ? 'bg-violet-500' : 'bg-gray-500'}`} aria-hidden />
                  <span className="font-semibold text-text-primary">{clockRange(s.startTime, s.endTime)}</span>
                  <span className="truncate text-text-secondary">
                    {s.kind === 'walkin' ? 'Walk-in' : 'Blocked'}
                    {s.label && s.label !== 'Blocked' && s.label !== 'Booked at the café' ? ` · ${s.label}` : ''} ·{' '}
                    {s.units?.length && s.units.every(labelOf)
                      ? s.units.map(labelOf).join(', ')
                      : `${s.seatsCount} ${s.seatsCount === 1 ? 'console' : 'consoles'}`}
                  </span>
                </span>
                <RemoveOffline id={s.id as string} name={s.kind === 'walkin' ? 'these' : 'the blocked'} onDone={onDone} />
              </div>
            ))}
          </div>
        )}

        {!isEve && d.startsOn && <DayHours d={d} day={day} dates={dates.filter((x) => !d.startsOn || x >= d.startsOn)} onDone={onDone} />}
        {isEve && (
          <p className="text-caption text-text-secondary">
            Launch night runs from 12 AM. Its hours follow your usual daily hours.
          </p>
        )}

        <AdvanceLimit d={d} onDone={onDone} />
      </CardContent>
    </Card>
  );
}

/** Opening hours of one day (several stretches, or closed), and copying the day to other days. */
function DayHours({ d, day, dates, onDone }: { d: OwnerDrop; day: string; dates: string[]; onDone: () => void }) {
  const usual: OpenHours[] = d.dailyStart && d.dailyEnd ? [{ start: d.dailyStart, end: d.dailyEnd }] : [];
  const own = d.dayHours?.[day];
  const [list, setList] = useState<OpenHours[]>(own ?? usual);
  const [closed, setClosed] = useState(own !== undefined && own.length === 0);
  const [copyTo, setCopyTo] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => {
    const o = d.dayHours?.[day];
    setList(o && o.length ? o : usual);
    setClosed(o !== undefined && o.length === 0);
    setCopyTo([]);
    setMsg(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day, d.dayHours]);

  const hoursText = (l: OpenHours[]) => (l.length ? l.map((x) => clockRange(x.start, x.end)).join(', ') : 'Closed');
  const save = async (body: Parameters<typeof setDropSchedule>[1], done: string) => {
    setBusy(true);
    setMsg(null);
    try {
      await setDropSchedule(d.id, body);
      setMsg({ ok: true, text: done });
      onDone();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error)?.message || 'Couldn’t save it. Please try again.' });
    } finally {
      setBusy(false);
    }
  };
  const hoursNow = closed ? [] : list;
  const others = dates.filter((x) => x !== day);
  const prices = d.dayPrices?.[day];

  return (
    <details className="rounded-xl border border-border px-3" open={own !== undefined && own.length === 0 ? true : undefined}>
      <summary className="flex min-h-[52px] cursor-pointer list-none items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2 font-semibold text-text-primary">
          <CalendarDays className="h-4 w-4 flex-none text-primary" aria-hidden /> Hours on {shortDate(day)}
        </span>
        <span className="truncate text-caption text-text-secondary">{own === undefined ? `Usual · ${hoursText(usual)}` : hoursText(own)}</span>
      </summary>
      <div className="flex flex-col gap-3 pb-3">
        <label className="flex min-h-[44px] items-center gap-3">
          <input type="checkbox" className="h-5 w-5 accent-primary" checked={closed} onChange={(e) => setClosed(e.target.checked)} />
          <span className="font-semibold text-text-primary">Closed this day</span>
        </label>
        {!closed && (
          <div className="flex flex-col gap-2">
            {list.map((x, i) => (
              <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
                <label className="flex min-w-0 flex-col gap-1 text-caption text-text-secondary">
                  Opens
                  <input
                    type="time"
                    step={1800}
                    value={x.start}
                    onChange={(e) => setList(list.map((y, j) => (j === i ? { ...y, start: e.target.value } : y)))}
                    className="h-11 w-full min-w-0 rounded-lg border border-border bg-card px-2 text-body text-text-primary"
                  />
                </label>
                <label className="flex min-w-0 flex-col gap-1 text-caption text-text-secondary">
                  Closes
                  <input
                    type="time"
                    step={1800}
                    value={x.end}
                    onChange={(e) => setList(list.map((y, j) => (j === i ? { ...y, end: e.target.value } : y)))}
                    className="h-11 w-full min-w-0 rounded-lg border border-border bg-card px-2 text-body text-text-primary"
                  />
                </label>
                <button
                  type="button"
                  aria-label="Remove these hours"
                  disabled={list.length < 2}
                  onClick={() => setList(list.filter((_, j) => j !== i))}
                  className="flex h-11 w-11 items-center justify-center rounded-lg text-text-secondary hover:text-error disabled:opacity-30"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
            <p className="text-caption text-text-secondary">A closing time before the opening time runs past midnight (6 PM to 2 AM).</p>
            {list.length < 4 && (
              <button
                type="button"
                onClick={() => setList([...list, { start: '18:00', end: '23:00' }])}
                className="inline-flex min-h-[44px] items-center gap-1.5 self-start font-semibold text-primary"
              >
                <Plus className="h-4 w-4" /> Add a break (open twice)
              </button>
            )}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => save({ dates: [day], hours: hoursNow }, closed ? `${shortDate(day)} is closed.` : `${shortDate(day)}: ${hoursText(hoursNow)}.`)} disabled={busy}>
            {busy ? 'Saving…' : 'Save hours'}
          </Button>
          {own !== undefined && (
            <Button variant="secondary" disabled={busy} onClick={() => save({ dates: [day], useDefaultHours: true }, `${shortDate(day)} is back to ${hoursText(usual)}.`)}>
              Use usual hours
            </Button>
          )}
        </div>

        {others.length > 0 && (
          <div className="flex flex-col gap-2 border-t border-border pt-3">
            <p className="flex items-center gap-2 font-semibold text-text-primary">
              <Copy className="h-4 w-4 text-primary" aria-hidden /> Copy {shortDate(day)}’s hours and prices to
            </p>
            <div className="flex flex-wrap gap-1.5">
              {others.map((x) => {
                const on = copyTo.includes(x);
                return (
                  <button
                    key={x}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setCopyTo(on ? copyTo.filter((y) => y !== x) : [...copyTo, x])}
                    className={`min-h-[44px] rounded-full border px-3 text-caption font-semibold ${on ? 'border-primary bg-primary/10 text-text-primary' : 'border-border text-text-secondary'}`}
                  >
                    {shortDate(x)}
                  </button>
                );
              })}
              <button type="button" onClick={() => setCopyTo(copyTo.length === others.length ? [] : others)} className="min-h-[40px] px-2 text-caption font-semibold text-primary">
                {copyTo.length === others.length ? 'None' : 'All'}
              </button>
            </div>
            <Button
              variant="secondary"
              disabled={busy || !copyTo.length}
              onClick={() =>
                save(
                  {
                    dates: copyTo,
                    ...(own === undefined ? { useDefaultHours: true } : { hours: own }),
                    ...(prices === undefined ? { useDefaultPrices: true } : { prices }),
                  },
                  `Copied to ${copyTo.length} ${copyTo.length === 1 ? 'day' : 'days'}. Bookings already made stay as they are.`,
                )
              }
            >
              Copy to {copyTo.length || ''} {copyTo.length === 1 ? 'day' : 'days'}
            </Button>
          </div>
        )}
        {msg && (
          <p role="status" className={`text-caption ${msg.ok ? 'text-success' : 'text-error'}`}>
            {msg.text}
          </p>
        )}
      </div>
    </details>
  );
}

const LIMITS: [number, string][] = [
  [0, 'Any day ahead'],
  [24, 'Next 24 hours'],
  [48, 'Next 48 hours'],
  [72, 'Next 3 days'],
  [168, 'Next 7 days'],
];

/** How far ahead people can book online. The café can always add bookings itself. */
function AdvanceLimit({ d, onDone }: { d: OwnerDrop; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const value = d.advanceHours ?? 0;
  const later = d.advanceFrom && d.advanceFrom > todayIso() ? d.advanceFrom : null;
  return (
    <div className="flex flex-col gap-1 border-t border-border pt-3">
      <label className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-semibold text-text-primary">Players can book online</span>
        <select
          value={value}
          disabled={busy}
          onChange={async (e) => {
            setBusy(true);
            setErr(null);
            try {
              await updateDrop(d.id, { advanceHours: Number(e.target.value) || null });
              onDone();
            } catch (x) {
              setErr((x as Error)?.message || 'Couldn’t save it.');
            } finally {
              setBusy(false);
            }
          }}
          className="h-11 min-w-0 rounded-lg border border-border bg-card px-2 text-body text-text-primary"
        >
          {LIMITS.map(([h, label]) => (
            <option key={h} value={h}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <p className="text-caption text-text-secondary">
        {value && later
          ? `Starts on ${shortDate(later)}. Until then players can book any day.`
          : value
            ? 'Further ahead, players see a note to contact KHEL-O. You can still add their booking here.'
            : 'Players can book any open day.'}
      </p>
      {err && <p className="text-caption text-error">{err}</p>}
    </div>
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
