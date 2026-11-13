'use client';

import { useState } from 'react';
import { Button, Card, CardContent, Input } from '@/components/ui';
import { addOfflineBooking, removeOfflineBooking, type OwnerDrop } from '@/lib/api/drops';
import { blockTimes, clock, dayLabel, wireTime } from '@/lib/drops';

const digits = (v: string, max: number) => v.replace(/\D/g, '').slice(0, max);

/** The café sold seats itself (walk-in, phone call, WhatsApp) and took the cash.
 *  Writing it here holds those seats, so the app never sells them again. */
export function OfflineBooking({ d, onDone }: { d: OwnerDrop; onDone: () => void }) {
  const open = d.blocks.filter((b) => b.seatsTotal > 0);
  const flexible = Boolean(d.maxHours);
  const [blockId, setBlockId] = useState('');
  const block = open.find((b) => b.id === blockId) ?? open[0];
  const [start, setStart] = useState('');
  const [hours, setHours] = useState('1');
  const [seats, setSeats] = useState('1');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  if (d.status === 'cancelled' || !block) return null;

  // Start times on the half hour inside the chosen day.
  const starts: string[] = [];
  if (flexible) {
    const [sh, sm] = block.startTime.split(':').map(Number);
    const [eh, em] = block.endTime.split(':').map(Number);
    for (let m = sh * 60 + sm; m + 60 <= eh * 60 + em; m += 30) {
      starts.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
    }
  }
  const startValue = starts.includes(start) ? start : starts[0] ?? '';
  const field = 'h-11 w-full rounded-xl border border-border bg-card px-3 text-body text-text-primary';

  // Free seats across the hours picked (flexible drops count seats per hour).
  let free = block.seatsLeft;
  if (flexible && startValue) {
    const [h0, m0] = startValue.split(':').map(Number);
    const steps = Math.max(1, Math.round((Number(hours) || 1) * 2));
    for (let i = 0; i < steps; i += 1) {
      const t = h0 * 60 + m0 + i * 30;
      const key = `${String(Math.floor(t / 60)).padStart(2, '0')}:00`;
      free = Math.min(free, block.hourFree?.[key] ?? block.seatsLeft);
    }
  }
  const n = Math.max(1, Number(seats) || 1);

  const save = async () => {
    setMsg(null);
    if (!name.trim()) {
      setMsg({ ok: false, text: 'Write the customer’s name first.' });
      return;
    }
    setBusy(true);
    try {
      await addOfflineBooking(d.id, {
        blockId: block.id,
        name: name.trim(),
        phone: phone.trim() || undefined,
        seats: n,
        startTime: flexible ? wireTime(startValue) : undefined,
        hours: flexible ? Number(hours) || 1 : undefined,
        amount: amount.trim() === '' ? undefined : Number(amount),
        note: note.trim() || undefined,
      });
      setMsg({ ok: true, text: `Saved. ${n} ${n === 1 ? 'seat is' : 'seats are'} now held, so the app will not sell ${n === 1 ? 'it' : 'them'}.` });
      setName('');
      setPhone('');
      setAmount('');
      setNote('');
      setSeats('1');
      onDone();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error)?.message || 'Couldn’t save it. Please try again.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card elevation="resting" data-tour="drop-offline">
      <CardContent className="flex flex-col gap-3 p-5">
        <div>
          <h2 className="font-heading text-h3 font-bold text-text-primary">Sold a seat at the café?</h2>
          <p className="text-body text-text-secondary">
            Someone paid you in cash, or booked by phone or WhatsApp. Write it here and the app stops selling those seats. No money moves through KHEL-O for these.
          </p>
        </div>
        <label className="flex flex-col gap-1.5 text-body font-medium text-text-primary">
          Which day
          <select value={block.id} onChange={(e) => setBlockId(e.target.value)} className={field}>
            {open.map((b) => (
              <option key={b.id} value={b.id}>
                {dayLabel(b.date)} · {blockTimes(b)} · {b.seatsLeft} left
              </option>
            ))}
          </select>
        </label>
        {flexible && (
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5 text-body font-medium text-text-primary">
              Starts at
              <select value={startValue} onChange={(e) => setStart(e.target.value)} className={field}>
                {starts.map((t) => (
                  <option key={t} value={t}>{clock(t)}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5 text-body font-medium text-text-primary">
              Hours
              <select value={hours} onChange={(e) => setHours(e.target.value)} className={field}>
                {Array.from({ length: d.maxHours ?? 1 }, (_, i) => i + 1).map((h) => (
                  <option key={h} value={h}>{h}</option>
                ))}
              </select>
            </label>
          </div>
        )}
        <Input label="Seats" inputMode="numeric" value={seats} onChange={(e) => setSeats(digits(e.target.value, 2))} hint={`${free} free at that time`} />
        <Input label="Customer name" value={name} onChange={(e) => setName(e.target.value)} />
        <Input label="Phone (optional)" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value.replace(/[^\d+ ]/g, '').slice(0, 15))} />
        <Input label="Cash you collected (₹, optional)" inputMode="numeric" value={amount} onChange={(e) => setAmount(digits(e.target.value, 7))} hint="Leave empty to use the usual price." />
        <Input label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Came to the counter, paid cash" />
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Hold these seats'}</Button>
          {msg && <span className={`text-caption ${msg.ok ? 'text-success' : 'text-error'}`}>{msg.text}</span>}
        </div>
      </CardContent>
    </Card>
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
