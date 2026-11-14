'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ImagePlus } from 'lucide-react';
import { uploadCafePhoto } from '@/lib/api/settings';
import { ArrowLeft, Bell, Check, CheckCircle2, ChevronDown, Download, Eye, MessageCircle, Phone, Plus, QrCode, Settings2, Share2, SlidersHorizontal, Users } from 'lucide-react';
import { Button, Card, CardContent, Input, Modal, SkeletonCard } from '@/components/ui';
import { ShareIconRow, WhatsAppButton } from '@/components/shared/ShareActions';
import { OwnerPageHeader } from '@/components/owner/OwnerPageHeader';
import { OwnerLoadError } from '@/components/owner/OwnerLoadError';
import { addDropConsoleSetup, cancelDrop, checkInDropPass, downloadDropCsv, getOwnerDrop, getWalkInQr, giveAwayReservation, setDropConsoles, updateDrop, type OwnerDrop } from '@/lib/api/drops';
import { blockTimes, clockRange, dayLabel, rupees, whenText } from '@/lib/drops';
import { RemoveOffline } from '@/components/drops/OfflineBooking';
import { SlotManager, type SlotPreset } from '@/components/drops/SlotManager';
import { spotlightWhenReady } from '@/components/owner/quickfind/QuickFindSpotlight';
import { DropPriceOptions, overlapping, priceOptionsPayload, type PriceOptions } from '@/components/drops/DropPriceOptions';

type Row = OwnerDrop['blocks'][number]['reservations'][number];

/** WhatsApp to the player, typed out: when, what is paid, what to pay at the café, and the QR pass link. */
function passMessage(d: OwnerDrop, b: OwnerDrop['blocks'][number], r: Row): string | null {
  const digits = (r.phone ?? '').replace(/\D/g, '').slice(-10);
  if (digits.length !== 10 || !r.passUrl) return null;
  const first = (r.name || '').trim().split(/\s+/)[0] || 'there';
  const when = `${dayLabel(r.playDate ?? b.date)}, ${r.startTime && r.endTime ? clockRange(r.startTime, r.endTime) : blockTimes(b)}`;
  const text = [
    `Hi ${first}, your ${d.game} seat at ${d.cafe.name} is confirmed.`,
    '',
    `When: ${when}${r.hours ? ` (${r.hours} ${r.hours === 1 ? 'hour' : 'hours'})` : ''}`,
    r.consoles?.length ? `Console: ${r.consoles.join(' + ')}` : `Seats: ${r.seats}`,
    `Booking: ${r.reference}`,
    `Paid online: ${rupees(r.deposit)}`,
    `Pay at the café: ${rupees(r.balanceDue)}`,
    '',
    `Your QR pass. Show it at the counter: ${r.passUrl}`,
    '',
    `Address: ${d.cafe.address}`,
    'Please come 15 minutes early. See you there!',
  ].join('\n');
  return `https://wa.me/91${digits}?text=${encodeURIComponent(text)}`;
}

const STATUS_LABEL: Record<string, string> = {
  pending_payment: 'Paying now',
  confirmed: 'Paid',
  checked_in: 'Here',
  refunded: 'Refunded',
  given_away: 'Seat given away',
};

const GRACE_MS = 15 * 60_000;

type DropTab = 'slots' | 'bookings' | 'share' | 'settings';
const TABS: DropTab[] = ['slots', 'bookings', 'share', 'settings'];
/** Quick Find anchors and Tutorial targets → the tab they live on. */
const TAB_OF: Record<string, DropTab> = {
  slots: 'slots',
  'drop-offline': 'slots',
  checkin: 'bookings',
  who: 'bookings',
  'drop-checkin': 'bookings',
  'drop-who': 'bookings',
  share: 'share',
  'drop-share': 'share',
  prices: 'settings',
  consoles: 'settings',
  details: 'settings',
  'drop-prices': 'settings',
  'drop-seats': 'settings',
  'drop-photo': 'settings',
  'drop-run': 'settings',
  'drop-cancel': 'settings',
};

const ymd = (dt: Date) => dt.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
const addDays = (iso: string, n: number) => ymd(new Date(new Date(`${iso}T12:00:00+05:30`).getTime() + n * 86_400_000));

/** Prices can change any time, even live. Reservations already made keep the price they were made at. */
function EditPrices({ d, onDone }: { d: OwnerDrop; onDone: () => void }) {
  const [price, setPrice] = useState(String(d.pricePerHour));
  const [short, setShort] = useState(String(d.deposit));
  const [long, setLong] = useState(String(d.depositLong));
  const [opts, setOpts] = useState<PriceOptions>({ lengthPrices: d.lengthPrices ?? [], timePrices: d.timePrices ?? [] });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const optsChanged = JSON.stringify(priceOptionsPayload(opts)) !== JSON.stringify({ lengthPrices: d.lengthPrices ?? [], timePrices: d.timePrices ?? [] });
  const changed = optsChanged || Number(price) !== d.pricePerHour || Number(short) !== d.deposit || Number(long) !== d.depositLong;
  const save = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await updateDrop(d.id, { pricePerHour: Number(price), depositAmount: Number(short), depositAmountLong: Number(long), ...priceOptionsPayload(opts) });
      setMsg({ ok: true, text: 'Saved. New reservations use these prices.' });
      onDone();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error)?.message || 'Could not save.' });
    } finally {
      setBusy(false);
    }
  };
  const num = (v: string) => v.replace(/\D/g, '').slice(0, 5);
  return (
    <Card elevation="flat" data-tour="drop-prices" data-qf="prices" className="md:col-span-2">
      <CardContent className="flex flex-col gap-3 p-4">
        <p className="font-heading text-body-emphasis font-bold text-text-primary">Price and booking fee</p>
        <div className="grid grid-cols-3 gap-2">
          {[
            ['Per hour (₹)', price, setPrice],
            ['Fee, 1–3 hr (₹)', short, setShort],
            ['Fee, 4–5 hr (₹)', long, setLong],
          ].map(([label, val, set]) => (
            <label key={label as string} className="flex flex-col justify-end gap-1 text-caption text-text-secondary">
              {label as string}
              <input
                inputMode="numeric"
                value={val as string}
                onChange={(e) => (set as (v: string) => void)(num(e.target.value))}
                className="h-11 rounded-lg border border-border bg-card px-2 text-body text-text-primary"
              />
            </label>
          ))}
        </div>
        {d.maxHours ? <DropPriceOptions base={Number(price) || 0} value={opts} onChange={setOpts} /> : null}
        <p className="text-caption text-text-secondary">Booking fee = paid online to hold a seat, then taken off their bill. New prices are for new bookings only.</p>
        <div className="flex items-center gap-3">
          <Button onClick={save} disabled={busy || !changed || !Number(price) || overlapping(opts.timePrices)}>Save prices</Button>
          {msg && <span className={`text-caption ${msg.ok ? 'text-success' : 'text-error'}`}>{msg.text}</span>}
        </div>
      </CardContent>
    </Card>
  );
}

/** The café's own photo (people playing) is what customers see first, so each café looks different. */
function CoverPhoto({ d, onDone }: { d: OwnerDrop; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const own = !!d.coverImageUrl;
  const set = async (url: string) => {
    await updateDrop(d.id, { coverImageUrl: url });
    onDone();
  };
  const pick = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) return setMsg({ ok: false, text: 'That photo is over 8 MB. Pick a smaller one.' });
    setBusy(true);
    setMsg(null);
    try {
      const url = await uploadCafePhoto(d.cafe.id, file, 'play_area');
      await set(url);
      setMsg({ ok: true, text: 'Saved. Players see it now.' });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error)?.message || 'Could not upload. Try again.' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card elevation="flat" data-tour="drop-photo">
      <CardContent className="flex flex-col gap-3 p-4">
        <p className="font-heading text-body-emphasis font-bold text-text-primary">Your photo</p>
        <p className="text-caption text-text-secondary">People playing at your café. Players see it instead of the game poster.</p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {own && <img src={d.coverImageUrl!} alt="Your drop photo" className="aspect-[16/9] w-full rounded-xl object-cover" />}
        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-xl bg-primary px-4 font-semibold text-white">
            <ImagePlus className="h-4 w-4" /> {busy ? 'Uploading…' : own ? 'Change photo' : 'Add a photo'}
            <input type="file" accept="image/*" className="hidden" disabled={busy} onChange={(e) => pick(e.target.files?.[0])} />
          </label>
          {own && (
            <button type="button" disabled={busy} onClick={() => set('').then(() => setMsg({ ok: true, text: 'Back to the game poster.' }))} className="text-body font-semibold text-text-secondary underline">
              Use the game poster
            </button>
          )}
          {msg && <span className={`text-caption ${msg.ok ? 'text-success' : 'text-error'}`}>{msg.text}</span>}
        </div>
      </CardContent>
    </Card>
  );
}

/** How many people can play at once. New days use it, and days not yet played change too. */
function SeatsPerDay({ d, onDone }: { d: OwnerDrop; onDone: () => void }) {
  const [seats, setSeats] = useState(String(d.seatsPerSlot ?? ''));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const changed = Number(seats) > 0 && Number(seats) !== d.seatsPerSlot;
  const save = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await updateDrop(d.id, { dailySeats: Number(seats) });
      setMsg({ ok: true, text: 'Saved. It applies to every day that has not been played yet.' });
      onDone();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error)?.message || 'Could not save.' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card elevation="flat" data-tour="drop-seats" data-qf="consoles">
      <CardContent className="flex flex-col gap-3 p-4">
        <p className="font-heading text-body-emphasis font-bold text-text-primary">Seats at one time</p>
        <p className="text-caption text-text-secondary">How many can play at once: the consoles you give the drop.</p>
        <div className="flex flex-wrap items-center gap-3">
          <input
            inputMode="numeric"
            aria-label="Seats at one time"
            value={seats}
            onChange={(e) => setSeats(e.target.value.replace(/\D/g, '').slice(0, 3))}
            className="h-11 w-24 rounded-lg border border-border bg-card px-2 text-body text-text-primary"
          />
          <Button onClick={save} disabled={busy || !changed}>Save seats</Button>
          {msg && <span className={`text-caption ${msg.ok ? 'text-success' : 'text-error'}`}>{msg.text}</span>}
        </div>
      </CardContent>
    </Card>
  );
}

/** "2 PS5 Pro and 1 Xbox Series X", from the drop's consoles. */
function consolesLine(d: OwnerDrop): string {
  const s = d.setups ?? [];
  if (!s.length) return '';
  const parts = s.map((x) => `${x.count} ${x.name}`);
  return parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/** Which consoles the drop uses: any mix of the café's setups (PS5s, Xboxes...). Players pick the exact
 *  console; the café can sell or block each one on its own in Manage slots. Consoles the café has but
 *  hasn't put in the drop are pointed out, and a new console (an Xbox Series X...) can be added right here. */
function DropConsoles({ d, onDone }: { d: OwnerDrop; onDone: () => void }) {
  const now = (d.consoles ?? []).map((c) => c.key);
  const [keys, setKeys] = useState<string[]>(now);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const nowKey = now.join();
  useEffect(() => setKeys(nowKey ? nowKey.split(',') : []), [nowKey]);
  const changed = [...keys].sort().join() !== [...now].sort().join();
  const toggle = (k: string) => setKeys(keys.includes(k) ? keys.filter((x) => x !== k) : [...keys, k]);
  const runs = (d.cafeSetups ?? []).filter((s) => s.runsGame !== false);
  const cant = (d.cafeSetups ?? []).filter((s) => s.runsGame === false);
  // Consoles the café has that the drop doesn't use yet (a setup that grew, or a new one).
  const missing = runs.flatMap((s) => Array.from({ length: s.count }, (_, i) => `${s.tierId}:${i + 1}`)).filter((k) => !now.includes(k));
  const missingText = runs
    .map((s) => ({ s, n: missing.filter((k) => k.startsWith(`${s.tierId}:`)).length }))
    .filter((x) => x.n)
    .map((x) => `${x.n} ${x.s.name}`)
    .join(' and ');
  const save = async (list: string[]) => {
    setBusy(true);
    setMsg(null);
    try {
      await setDropConsoles(d.id, list);
      setMsg({ ok: true, text: `Saved. The drop now uses ${list.length} ${list.length === 1 ? 'console' : 'consoles'}.` });
      onDone();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error)?.message || 'Could not save.' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card elevation="flat" data-tour="drop-seats" data-qf="consoles">
      <CardContent className="flex flex-col gap-3 p-4">
        <p className="font-heading text-body-emphasis font-bold text-text-primary">Consoles in this drop</p>
        <p className="text-caption text-text-secondary">Tick the consoles players can book. They pick the exact one.</p>
        {missing.length > 0 && !changed && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-warning/40 bg-warning/10 px-3 py-2">
            <p className="min-w-0 text-caption font-semibold text-text-primary">
              {missingText} not in the drop yet, so players can&apos;t book {missing.length === 1 ? 'it' : 'them'}.
            </p>
            <Button disabled={busy} onClick={() => save([...now, ...missing])}>
              Add {missing.length === 1 ? 'it' : 'them'}
            </Button>
          </div>
        )}
        {runs.map((s) => (
          // Setups not in the drop stay folded, so the list stays short.
          <details key={s.tierId} open={now.some((k) => k.startsWith(`${s.tierId}:`)) || undefined} className="group rounded-xl border border-border px-3">
            <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-2 text-caption font-semibold text-text-primary">
              <span>
                {s.name} <span className="font-normal text-text-secondary">· {keys.filter((k) => k.startsWith(`${s.tierId}:`)).length} of {s.count} in the drop</span>
              </span>
              <ChevronDown className="h-4 w-4 text-text-secondary transition-transform group-open:rotate-180" aria-hidden />
            </summary>
            <div className="flex flex-wrap gap-1.5 pb-3">
              {Array.from({ length: s.count }, (_, i) => {
                const k = `${s.tierId}:${i + 1}`;
                const on = keys.includes(k);
                return (
                  <button
                    key={k}
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    onClick={() => toggle(k)}
                    className={`inline-flex min-h-[44px] items-center gap-2 rounded-xl border px-3 text-caption font-semibold ${
                      on ? 'border-primary bg-primary/10 text-text-primary' : 'border-border bg-card text-text-secondary'
                    }`}
                  >
                    <span className={`flex h-4 w-4 items-center justify-center rounded border ${on ? 'border-primary bg-primary text-white' : 'border-border'}`} aria-hidden>
                      {on && <Check className="h-3 w-3" />}
                    </span>
                    {s.name} {i + 1}
                  </button>
                );
              })}
            </div>
          </details>
        ))}
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => save(keys)} disabled={busy || !changed || !keys.length}>
            {busy ? 'Saving…' : 'Save consoles'}
          </Button>
          {!keys.length && <span className="text-caption text-error">Pick at least one console.</span>}
          {msg && <span className={`text-caption ${msg.ok ? 'text-success' : 'text-error'}`}>{msg.text}</span>}
        </div>
        <AddConsole d={d} onDone={onDone} />
        {cant.length > 0 && (
          <p className="text-caption text-text-secondary">
            Not listed: {cant.map((s) => s.name).join(', ')}. {cant.length === 1 ? 'It' : 'They'} can&apos;t run {d.game}.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/** A console the café has that isn't on KHEL-O yet (an Xbox Series S...): pick it, say how many, done.
 *  It becomes a setup of the café and joins this drop straight away. */
function AddConsole({ d, onDone }: { d: OwnerDrop; onDone: () => void }) {
  const options = d.addableConsoles ?? [];
  const [open, setOpen] = useState(false);
  const [model, setModel] = useState('');
  const [count, setCount] = useState(1);
  const [price, setPrice] = useState(String(d.pricePerHour));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  if (!options.length) return null;
  const chosen = options.find((o) => o.model === model);
  const add = async () => {
    if (!chosen) return;
    setBusy(true);
    setMsg(null);
    try {
      await addDropConsoleSetup(d.id, { model, count, pricePerHour: Number(price) });
      setMsg({ ok: true, text: `Added ${count} ${chosen.name}. Players can book ${count === 1 ? 'it' : 'them'} now.` });
      setOpen(false);
      setModel('');
      setCount(1);
      onDone();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error)?.message || 'Could not add.' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-col gap-2 border-t border-border pt-3">
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className="inline-flex min-h-[44px] items-center gap-2 self-start font-semibold text-primary">
          <Plus className="h-4 w-4" aria-hidden /> Add a console you have
        </button>
      ) : (
        <>
          <p className="text-body font-semibold text-text-primary">Add a console</p>
          <p className="text-caption text-text-secondary">Only consoles that run {d.game} are listed.</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
            <label className="col-span-2 flex min-w-0 flex-col gap-1 text-caption text-text-secondary sm:col-span-1">
              Console
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="h-11 w-full min-w-0 rounded-lg border border-border bg-card px-2 text-body text-text-primary"
              >
                <option value="">Pick one</option>
                {options.map((o) => (
                  <option key={o.model} value={o.model}>
                    {o.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-0 flex-col gap-1 text-caption text-text-secondary">
              How many
              <select
                value={count}
                onChange={(e) => setCount(Number(e.target.value))}
                className="h-11 w-full min-w-0 rounded-lg border border-border bg-card px-2 text-body text-text-primary"
              >
                {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-0 flex-col gap-1 text-caption text-text-secondary">
              Normal ₹ an hour
              <input
                inputMode="numeric"
                value={price}
                onChange={(e) => setPrice(e.target.value.replace(/\D/g, '').slice(0, 5))}
                className="h-11 w-full min-w-0 rounded-lg border border-border bg-card px-2 text-body tabular-nums text-text-primary"
              />
            </label>
          </div>
          <p className="text-caption text-text-secondary">Normal price = bookings outside the drop.</p>
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={add} disabled={busy || !chosen || !Number(price)}>
              {busy ? 'Adding…' : chosen ? `Add ${count} ${chosen.name}` : 'Add'}
            </Button>
            <Button variant="secondary" disabled={busy} onClick={() => setOpen(false)}>
              Back
            </Button>
          </div>
        </>
      )}
      {msg && <span className={`text-caption ${msg.ok ? 'text-success' : 'text-error'}`}>{msg.text}</span>}
    </div>
  );
}

/** The one big button that stops everything. It asks first, because it refunds real money. */
function CancelDrop({ d, onDone }: { d: OwnerDrop; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const n = d.totals.paidReservations;
  const paidText = n === 0 ? 'Nobody has paid yet, so there is nothing to refund.' : `${n} paid ${n === 1 ? 'booking gets' : 'bookings get'} a full refund.`;
  if (d.state === 'cancelled') return <p className="rounded-xl bg-surface p-3 text-body text-text-secondary">This drop was cancelled. Everyone was refunded.</p>;
  return (
    <Card elevation="flat" className="border-error/30" data-tour="drop-cancel">
      <CardContent className="flex flex-col gap-2 p-4">
        <p className="font-heading text-body-emphasis font-bold text-text-primary">Cancel this drop</p>
        <p className="text-caption text-text-secondary">Only if you can’t run it. Everyone who paid gets a full refund. Can’t be undone.</p>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="secondary" disabled={busy} onClick={() => setAsking(true)}>
            Cancel drop and refund everyone
          </Button>
          {msg && <span className={`text-caption ${msg.ok ? 'text-success' : 'text-error'}`}>{msg.text}</span>}
        </div>
        <Confirm
          open={asking}
          title="Cancel this drop?"
          body={`"${d.title}" stops now. ${paidText} This cannot be undone.`}
          yes="Yes, cancel and refund"
          no="Keep the drop"
          busy={busy}
          onNo={() => setAsking(false)}
          onYes={async () => {
            setBusy(true);
            setMsg(null);
            try {
              const r = await cancelDrop(d.id);
              setMsg({ ok: r.failed === 0, text: r.failed ? `${r.refunded} refunded, ${r.failed} need help. Contact KHEL-O support.` : `Done. ${r.refunded} refunded.` });
              onDone();
            } catch (e) {
              setMsg({ ok: false, text: (e as Error)?.message || 'Could not cancel.' });
            } finally {
              setBusy(false);
              setAsking(false);
            }
          }}
        />
      </CardContent>
    </Card>
  );
}

/** Rolling drops run by themselves for up to 2 weeks. The owner can add days or stop it. */
function RunControl({ d, onDone }: { d: OwnerDrop; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const hardEnd = addDays(d.startsOn!, 13);
  const today = ymd(new Date());
  const over = d.endsOn! < today;
  const set = async (endsOn: string) => {
    setBusy(true);
    setErr(null);
    try {
      await updateDrop(d.id, { endsOn });
      onDone();
    } catch (e) {
      setErr((e as Error)?.message || 'Could not change it.');
    } finally {
      setBusy(false);
    }
  };
  const nice = (iso: string) => new Date(`${iso}T12:00:00+05:30`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
  return (
    <Card elevation="flat" data-tour="drop-run">
      <CardContent className="flex flex-col gap-2 p-4">
        <p className="font-heading text-body-emphasis font-bold text-text-primary">
          {over ? `This drop ended on ${nice(d.endsOn!)}` : `Runs until ${nice(d.endsOn!)}`}
        </p>
        <p className="text-caption text-text-secondary">New days open by themselves. It can run until {nice(hardEnd)}.</p>
        <div className="flex flex-wrap gap-2">
          {d.endsOn! < hardEnd && !over && (
            <Button variant="secondary" disabled={busy} onClick={() => set(hardEnd < addDays(d.endsOn!, 7) ? hardEnd : addDays(d.endsOn!, 7))}>
              Add a week
            </Button>
          )}
          {!over && (
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => setAsking(true)}
            >
              Stop after today
            </Button>
          )}
        </div>
        {err && <p className="text-caption text-error">{err}</p>}
        <Confirm
          open={asking}
          title="Stop after today?"
          body="No new days will open after today. People who already reserved keep their seats."
          yes="Yes, stop after today"
          no="Keep it running"
          busy={busy}
          onNo={() => setAsking(false)}
          onYes={async () => {
            await set(today);
            setAsking(false);
          }}
        />
      </CardContent>
    </Card>
  );
}

function GiveAway({ id, name, onDone }: { id: string; name: string; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <span className="flex flex-col items-end gap-1">
      <Button variant="secondary" size="sm" disabled={busy} onClick={() => setAsking(true)}>
        Give seat away
      </Button>
      {err && <span className="text-caption text-error">{err}</span>}
      <Confirm
        open={asking}
        title="Give this seat away?"
        body={`${name} is more than 15 minutes late. The seat opens for someone else and ${name} does not get the booking fee back.`}
        yes="Yes, give it away"
        no="Wait a bit longer"
        busy={busy}
        onNo={() => setAsking(false)}
        onYes={async () => {
          setBusy(true);
          setErr(null);
          try {
            await giveAwayReservation(id);
            onDone();
          } catch (e) {
            setErr((e as Error)?.message || 'Could not do that.');
          } finally {
            setBusy(false);
            setAsking(false);
          }
        }}
      />
    </span>
  );
}

/** One question, two clear answers. Used before anything that moves money or cannot be undone. */
function Confirm({
  open, title, body, yes, no, busy, onYes, onNo,
}: {
  open: boolean; title: string; body: string; yes: string; no: string; busy: boolean; onYes: () => void; onNo: () => void;
}) {
  return (
    <Modal
      isOpen={open}
      onClose={onNo}
      title={title}
      size="sm"
      footer={
        <div className="flex w-full flex-col gap-2 sm:flex-row-reverse">
          <Button onClick={onYes} disabled={busy} fullWidth className="sm:w-auto">
            {busy ? 'Working…' : yes}
          </Button>
          <Button variant="ghost" onClick={onNo} disabled={busy} fullWidth className="sm:w-auto">
            {no}
          </Button>
        </div>
      }
    >
      <p className="text-body text-text-secondary">{body}</p>
    </Modal>
  );
}

/** The link the café sends out. Copying it from the browser bar was the only way before. */
function ShareDrop({ d }: { d: OwnerDrop }) {
  const url = typeof window !== 'undefined' ? `${window.location.origin}/drops/${d.slug}` : `/drops/${d.slug}`;
  const hidden = d.status !== 'live';
  return (
    <Card elevation="resting" data-tour="drop-share" data-qf="share">
      <CardContent className="flex flex-col gap-3 p-4">
        <div>
          <p className="font-heading text-body-emphasis font-bold text-text-primary">Share your drop</p>
          <p className="text-caption text-text-secondary">
            {hidden ? 'It’s hidden. Put it live first, then send the link.' : 'Send it to your regulars. Post it on Instagram.'}
          </p>
        </div>
        {d.waitlistCount > 0 && (
          <p className="flex items-center gap-1.5 rounded-xl bg-amber-50 px-3 py-2 text-caption font-semibold text-amber-900">
            <Bell className="h-4 w-4" aria-hidden /> {d.waitlistCount} {d.waitlistCount === 1 ? 'person is' : 'people are'} waiting to hear it’s open
          </p>
        )}
        <p className="truncate rounded-xl bg-surface px-3 py-2.5 font-mono text-caption text-text-primary">{url.replace(/^https?:\/\//, '')}</p>
        <WhatsAppButton
          text={`${d.game} at ${d.cafe.name}. Only ${d.seatsPerSlot ?? d.seatsTotal} seats${d.seatsPerSlot ? ' a night' : ''}. Reserve yours:`}
          url={url}
          label="Send on WhatsApp"
        />
        <ShareIconRow url={url} />
        {!hidden && <WalkInQr slug={d.slug} cafe={d.cafe.name} />}
      </CardContent>
    </Card>
  );
}

/** A code for the counter: someone who walks in scans it and books a free seat through KHEL-O, so the booking is on the list. */
function WalkInQr({ slug, cafe }: { slug: string; cafe: string }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    let live = true;
    getWalkInQr(slug)
      .then((r) => live && setSrc(r.qr))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [slug]);
  if (!src) return null;
  return (
    <div className="flex items-center gap-4 rounded-xl border border-border p-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="QR code to reserve a seat" className="h-28 w-28 flex-none rounded-lg" />
      <div className="min-w-0">
        <p className="font-semibold text-text-primary">Walk-in QR</p>
        <p className="text-caption text-text-secondary">Someone at the counter wants a seat? They scan, pay the fee, done.</p>
        <a href={src} download={`${cafe.replace(/\W+/g, '-')}-walk-in-qr.png`} className="mt-1 inline-block text-body font-semibold text-primary underline">
          Download to print
        </a>
      </div>
    </div>
  );
}

/** The words and opening times, editable after saving. Hours and the rig stay fixed once people can book. */
function EditDetails({ d, onDone }: { d: OwnerDrop; onDone: () => void }) {
  const local = (iso: string) => new Date(iso).toLocaleString('sv-SE', { timeZone: 'Asia/Kolkata' }).replace(' ', 'T').slice(0, 16);
  const [title, setTitle] = useState(d.title);
  const [tagline, setTagline] = useState(d.tagline ?? '');
  const [publicAt, setPublicAt] = useState(local(d.publicStartsAt));
  const [earlyAt, setEarlyAt] = useState(local(d.earlyAccessStartsAt));
  const [code, setCode] = useState(d.earlyAccessCode ?? '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const changed =
    title.trim() !== d.title || tagline.trim() !== (d.tagline ?? '') || publicAt !== local(d.publicStartsAt) ||
    earlyAt !== local(d.earlyAccessStartsAt) || code.trim().toUpperCase() !== (d.earlyAccessCode ?? '');
  const save = async () => {
    if (title.trim().length < 3) return setMsg({ ok: false, text: 'The name needs at least 3 letters.' });
    // No code means no early access: it opens for everyone at one time.
    const early = code.trim() ? earlyAt : publicAt;
    if (early > publicAt) return setMsg({ ok: false, text: 'Early access has to start before everyone can reserve.' });
    setBusy(true);
    setMsg(null);
    try {
      await updateDrop(d.id, {
        title: title.trim(),
        tagline: tagline.trim(),
        earlyAccessCode: code.trim(),
        publicStartsAt: `${publicAt}:00+05:30`,
        earlyAccessStartsAt: `${early}:00+05:30`,
      });
      setMsg({ ok: true, text: 'Saved.' });
      onDone();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error)?.message || 'Could not save.' });
    } finally {
      setBusy(false);
    }
  };
  const when = 'h-11 w-full rounded-xl border border-border bg-card px-3 text-body text-text-primary';
  return (
    <Card elevation="flat" data-tour="drop-details" data-qf="details">
      <CardContent className="flex flex-col gap-3 p-4">
        <p className="font-heading text-body-emphasis font-bold text-text-primary">Name and opening</p>
        <Input label="Name" value={title} onChange={(e) => setTitle(e.target.value)} />
        <Input label="One line about it" value={tagline} onChange={(e) => setTagline(e.target.value)} placeholder="Play it on a PS5 and a big screen, launch week." />
        <label className="flex flex-col gap-1.5 text-body font-medium text-text-primary">
          Everyone can reserve from
          <input type="datetime-local" value={publicAt} onChange={(e) => setPublicAt(e.target.value)} className={when} />
        </label>
        <Input label="Early access code (optional)" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} hint="People with this code can reserve before everyone else." />
        {code.trim() && (
          <label className="flex flex-col gap-1.5 text-body font-medium text-text-primary">
            Early access from
            <input type="datetime-local" value={earlyAt} onChange={(e) => setEarlyAt(e.target.value)} className={when} />
          </label>
        )}
        <p className="text-caption text-text-secondary">India time. Daily hours can’t change here: make a new drop for that.</p>
        <div className="flex items-center gap-3">
          <Button onClick={save} disabled={busy || !changed}>Save</Button>
          {msg && <span className={`text-caption ${msg.ok ? 'text-success' : 'text-error'}`}>{msg.text}</span>}
        </div>
      </CardContent>
    </Card>
  );
}

/** One drop, run from start to finish: status, sharing, check-in, who is coming, settings.
 *  The same screen serves the café owner and an admin (base="/admin/drops"). */
export function DropManage({ id, base = '/owner/drops', admin = false }: { id: string; base?: string; admin?: boolean }) {
  const qc = useQueryClient();
  const key = ['owner', 'drop', id];
  const { data: d, isLoading, error, refetch } = useQuery({ queryKey: key, queryFn: () => getOwnerDrop(id), refetchInterval: 10_000, refetchOnWindowFocus: true });
  const refresh = () => qc.invalidateQueries({ queryKey: key });

  // Quick Find: ?slot=walkin|block|price&console=<key>&hours=3&date=… pre-sets Manage slots.
  const searchParams = useSearchParams();
  const slot = searchParams.get('slot');

  // Which tab: ?tab=, else the tab that holds a Quick Find target (?qf=prices → Settings), else Slots.
  const [tab, setTab] = useState<DropTab>(() => {
    const t = searchParams.get('tab') as DropTab | null;
    if (t && TABS.includes(t)) return t;
    return TAB_OF[searchParams.get('qf') ?? ''] ?? 'slots';
  });
  const pickTab = (t: DropTab) => {
    setTab(t);
    const url = new URL(window.location.href);
    url.searchParams.set('tab', t);
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}`);
  };
  // Quick Find and the Tutorial ask for a part of the page by name; open the tab that has it.
  useEffect(() => {
    const reveal = (e: Event) => {
      const t = TAB_OF[(e as CustomEvent<string>).detail];
      if (t) setTab(t);
    };
    window.addEventListener('khelo:reveal', reveal);
    return () => window.removeEventListener('khelo:reveal', reveal);
  }, []);
  const presetKey = ['slot', 'console', 'hours', 'date'].map((k) => searchParams.get(k) ?? '').join('|');
  const [preset, setPreset] = useState<SlotPreset | undefined>(undefined);
  useEffect(() => {
    if (!d || (slot !== 'walkin' && slot !== 'block' && slot !== 'price')) return;
    const hours = Number(searchParams.get('hours'));
    const date = searchParams.get('date');
    setPreset({
      key: `${presetKey}|${Date.now()}`,
      mode: slot,
      consoles: searchParams.get('console') ? [searchParams.get('console') as string] : undefined,
      hours: Number.isFinite(hours) && hours > 0 ? hours : undefined,
      date: date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined,
    });
    setTab('slots');
    spotlightWhenReady('slots');
    const url = new URL(window.location.href);
    ['slot', 'console', 'hours', 'date'].forEach((k) => url.searchParams.delete(k));
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}`);
    // Re-run for each new link, not for every 10-second refetch of the drop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Boolean(d), presetKey]);

  if (isLoading) return <SkeletonCard />;
  if (error || !d) return <OwnerLoadError error={error} title="Couldn’t load this drop" onRetry={() => refetch()} />;

  const today = ymd(new Date());
  const days = d.blocks.filter((b) => b.reservations.some((r) => r.source !== 'block'));
  const upcoming = days.filter((b) => b.date >= today);
  const earlier = days.filter((b) => b.date < today).reverse();
  const toCome = upcoming.reduce((n, b) => n + b.reservations.filter((r) => r.source !== 'block' && r.status === 'confirmed').length, 0);
  const tabs: { key: DropTab; label: string; Icon: typeof Users; count?: number }[] = [
    { key: 'slots', label: 'Slots', Icon: SlidersHorizontal },
    { key: 'bookings', label: 'Bookings', Icon: Users, count: toCome },
    { key: 'share', label: 'Share', Icon: Share2 },
    { key: 'settings', label: 'Settings', Icon: Settings2 },
  ];

  return (
    <div className="flex flex-col gap-4">
      <Link href={base} className="-mb-2 inline-flex min-h-[44px] items-center gap-1 self-start text-body font-semibold text-text-secondary hover:text-text-primary">
        <ArrowLeft className="h-4 w-4" /> All drops
      </Link>
      <OwnerPageHeader
        guide={admin ? undefined : 'drop'}
        title={d.title}
        description={[d.cafe.name, consolesLine(d) || d.playsOn, `${rupees(d.pricePerHour)} an hour`, `${rupees(d.deposit)} to book a seat`].filter(Boolean).join(' · ')}
      />

      <StatusBar d={d} onChanged={refresh} />

      <div className="grid grid-cols-3 gap-2" data-tour="drop-stats">
        <Stat label="Seats sold" value={`${d.totals.seatsSold} of ${d.seatsTotal}`} hint={(d.totals.offlineSeats ?? 0) > 0 ? `${d.totals.offlineSeats} at the café` : undefined} />
        <Stat label="Checked in" value={String(d.totals.checkedIn)} />
        <Stat label="To collect" value={rupees(d.totals.balanceToCollect)} hint="at the café" />
      </div>

      {/* One job per tab. As one page this was twenty phone screens of forms and text. */}
      <div
        role="tablist"
        aria-label="Drop sections"
        className="sticky top-14 z-20 -mx-4 flex gap-1 overflow-x-auto border-b border-border bg-surface/95 px-4 py-2 backdrop-blur lg:-mx-8 lg:px-8 [scrollbar-width:none]"
      >
        {tabs.map(({ key: k, label, Icon, count }) => {
          const on = tab === k;
          return (
            <button
              key={k}
              type="button"
              role="tab"
              id={`drop-tab-${k}`}
              aria-selected={on}
              aria-controls={`drop-panel-${k}`}
              onClick={() => pickTab(k)}
              className={`flex min-h-[44px] flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-3 text-body font-semibold transition-colors ${
                on ? 'bg-card text-text-primary shadow-sm ring-1 ring-border' : 'text-text-secondary hover:bg-card/60 hover:text-text-primary'
              }`}
            >
              <Icon className={`hidden h-4 w-4 sm:block ${on ? 'text-primary' : ''}`} aria-hidden />
              {label}
              {count ? <span className="rounded-full bg-primary px-1.5 text-[11px] font-bold leading-5 text-white">{count}</span> : null}
            </button>
          );
        })}
      </div>

      <div role="tabpanel" id={`drop-panel-${tab}`} aria-labelledby={`drop-tab-${tab}`} className="flex flex-col gap-4">
        {tab === 'slots' && <SlotManager d={d} onDone={refresh} preset={preset} />}

        {tab === 'bookings' && (
          <>
            <div data-tour="drop-checkin" data-qf="checkin">
              <CheckInBox onDone={refresh} />
            </div>
            <div className="flex items-center justify-between gap-3" data-tour="drop-who" data-qf="who">
              <h2 className="font-heading text-h3 font-bold text-text-primary">Who is coming</h2>
              <Link href="/owner/availability" className="text-body font-semibold text-primary">Hour by hour</Link>
            </div>
            {!days.length && (
              <div className="flex flex-col items-start gap-3 rounded-2xl border border-border bg-card p-4">
                <p className="text-body text-text-secondary">No bookings yet. Send your link and they show up here.</p>
                <Button variant="secondary" onClick={() => pickTab('share')}>
                  <Share2 className="mr-1.5 h-4 w-4" /> Share your drop
                </Button>
              </div>
            )}
            {days.length > 0 && !upcoming.length && <p className="text-body text-text-secondary">Nothing booked from today on.</p>}
            {upcoming.map((b) => (
              <DayCard key={b.id} d={d} b={b} onDone={refresh} />
            ))}
            {earlier.length > 0 && (
              <details className="group rounded-2xl border border-border bg-card px-4">
                <summary className="flex min-h-[52px] cursor-pointer list-none items-center justify-between gap-2 font-semibold text-text-primary">
                  Earlier days ({earlier.length})
                  <ChevronDown className="h-4 w-4 text-text-secondary transition-transform group-open:rotate-180" aria-hidden />
                </summary>
                <div className="flex flex-col gap-3 pb-4">
                  {earlier.map((b) => (
                    <DayCard key={b.id} d={d} b={b} onDone={refresh} flat />
                  ))}
                </div>
              </details>
            )}
            {days.length > 0 && (
              <Button variant="secondary" onClick={() => downloadDropCsv(d.id, d.slug)} className="self-start">
                <Download className="mr-1.5 h-4 w-4" /> Download the list (CSV)
              </Button>
            )}
          </>
        )}

        {tab === 'share' && (
          <>
            {d.status !== 'cancelled' && <ShareDrop d={d} />}
            <Funnel d={d} />
          </>
        )}

        {tab === 'settings' && (
          <>
            <div className="grid gap-4 md:grid-cols-2">
              {d.status !== 'cancelled' && <EditDetails d={d} onDone={refresh} />}
              <EditPrices d={d} onDone={refresh} />
              {d.rolling && (d.cafeSetups?.length ? <DropConsoles d={d} onDone={refresh} /> : <SeatsPerDay d={d} onDone={refresh} />)}
              <CoverPhoto d={d} onDone={refresh} />
              {d.rolling && d.endsOn && d.startsOn && <RunControl d={d} onDone={refresh} />}
            </div>
            <CancelDrop d={d} onDone={refresh} />
          </>
        )}
      </div>
    </div>
  );
}

/** One day's bookings: who, when, what to collect, and the buttons for each. */
function DayCard({ d, b, onDone, flat = false }: { d: OwnerDrop; b: OwnerDrop['blocks'][number]; onDone: () => void; flat?: boolean }) {
  const rows = b.reservations.filter((r) => r.source !== 'block');
  const list = (
    <>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-heading text-body-emphasis font-bold text-text-primary">{dayLabel(b.date)}</h3>
        <span className="text-caption text-text-secondary">
          {rows.length} {rows.length === 1 ? 'booking' : 'bookings'}
        </span>
      </div>
      <ul className="flex flex-col divide-y divide-border">
        {rows.map((r) => (
          <BookingRow key={r.id} d={d} b={b} r={r} onDone={onDone} />
        ))}
      </ul>
    </>
  );
  if (flat) return <div className="flex flex-col gap-1 border-t border-border pt-3">{list}</div>;
  return (
    <Card elevation="resting">
      <CardContent className="flex flex-col gap-1 p-4">{list}</CardContent>
    </Card>
  );
}

const PILL: Record<string, { text: string; tone: string }> = {
  confirmed: { text: 'Booked', tone: 'bg-sky-100 text-sky-800' },
  checked_in: { text: 'Here', tone: 'bg-green-100 text-green-800' },
  pending_payment: { text: 'Paying now', tone: 'bg-amber-100 text-amber-800' },
  refunded: { text: 'Refunded', tone: 'bg-surface text-text-secondary' },
  given_away: { text: 'Given away', tone: 'bg-surface text-text-secondary' },
};

/** A booking as the counter needs it: name and seats, then when, which console and what to collect,
 *  then the buttons. The e-mail lives in the CSV; the phone is one tap. */
function BookingRow({ d, b, r, onDone }: { d: OwnerDrop; b: OwnerDrop['blocks'][number]; r: Row; onDone: () => void }) {
  const offline = r.source === 'offline';
  const pill = offline && r.status === 'confirmed' ? { text: 'Sold at café', tone: 'bg-violet-100 text-violet-800' } : PILL[r.status] ?? { text: STATUS_LABEL[r.status] ?? r.status, tone: 'bg-surface text-text-secondary' };
  const open = r.status === 'confirmed' || r.status === 'checked_in';
  const pass = !offline && open ? passMessage(d, b, r) : null;
  const late = Date.now() >= new Date(`${b.date}T${r.startTime ?? b.startTime}:00+05:30`).getTime() + GRACE_MS;
  const facts = [
    r.startTime && r.endTime ? clockRange(r.startTime, r.endTime) : blockTimes(b),
    r.consoles?.length ? r.consoles.join(' + ') : '',
    r.earlyAccess ? 'early access' : '',
    offline && r.note ? r.note : '',
  ].filter(Boolean);
  return (
    <li className="flex flex-col gap-2 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold text-text-primary">
            {r.name} <span className="font-normal text-text-secondary">· {r.seats} {r.seats === 1 ? 'seat' : 'seats'}</span>
          </p>
          <p className="text-caption text-text-secondary">{facts.join(' · ')}</p>
          <p className="text-caption">
            {offline ? (
              <span className="text-text-secondary">{r.price ? `${rupees(r.price)} cash taken` : 'Sold at the café'}</span>
            ) : open && r.balanceDue > 0 ? (
              <span className="font-semibold text-text-primary">Collect {rupees(r.balanceDue)}</span>
            ) : open ? (
              <span className="text-text-secondary">Nothing to collect</span>
            ) : null}
            <span className="ml-1.5 font-mono text-[11px] text-text-secondary">{r.reference}</span>
          </p>
        </div>
        <span className={`flex flex-none items-center gap-1 rounded-full px-2 py-0.5 text-caption font-semibold ${pill.tone}`}>
          {r.status === 'checked_in' && <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />}
          {pill.text}
        </span>
      </div>
      {(r.status === 'confirmed' || pass || r.phone) && (
        <div className="flex flex-wrap items-center gap-2">
          {r.status === 'confirmed' && r.checkinToken && <RowCheckIn token={r.checkinToken} onDone={onDone} />}
          {pass && (
            <a
              href={pass}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg bg-[#25D366] px-3 text-caption font-semibold text-white hover:bg-[#1ebe5a]"
            >
              <MessageCircle className="h-4 w-4" aria-hidden /> Send pass
            </a>
          )}
          {r.phone && (
            <a
              href={`tel:${r.phone}`}
              aria-label={`Call ${r.name} on ${r.phone}`}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-border px-3 text-caption font-semibold text-text-primary hover:bg-surface"
            >
              <Phone className="h-4 w-4" aria-hidden /> Call
            </a>
          )}
          {r.status === 'confirmed' && offline && <RemoveOffline id={r.id} name={r.name} onDone={onDone} />}
          {r.status === 'confirmed' && r.checkinToken && late && <GiveAway id={r.id} name={r.name} onDone={onDone} />}
        </div>
      )}
    </li>
  );
}

/** Live or hidden, in one line, with the one switch. */
function StatusBar({ d, onChanged }: { d: OwnerDrop; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toggle = async () => {
    setBusy(true);
    setError(null);
    try {
      await updateDrop(d.id, { status: d.status === 'live' ? 'draft' : 'live' });
      onChanged();
    } catch (e) {
      setError((e as Error)?.message || 'Could not change it.');
    } finally {
      setBusy(false);
    }
  };
  const [label, hint, dot] =
    d.status === 'cancelled'
      ? ['Cancelled', 'everyone who paid was refunded', 'bg-gray-400']
      : d.status === 'draft'
      ? ['Hidden', 'only you can see it', 'bg-amber-500']
      : d.state === 'open'
      ? ['Live', 'anyone can book', 'bg-green-500']
      : d.state === 'early'
      ? ['Early access', 'only people with the code can book', 'bg-violet-500']
      : ['Live soon', `opens ${whenText(d.publicStartsAt)}`, 'bg-sky-500'];
  return (
    <div data-qf="status" className="flex flex-col gap-1">
      <div className="flex items-center gap-2 rounded-2xl border border-border bg-card py-2 pl-3 pr-2">
        <span className="relative flex h-2.5 w-2.5 flex-none" aria-hidden>
          {d.status === 'live' && d.state === 'open' && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-60 motion-reduce:hidden" />}
          <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${dot}`} />
        </span>
        <p className="min-w-0 flex-1 text-body">
          <span className="font-semibold text-text-primary">{label}</span>
          <span className="text-text-secondary"> · {hint}</span>
        </p>
        <a
          href={`/drops/${d.slug}`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="See what customers see (opens a new tab)"
          title="See what customers see"
          className="flex h-11 w-11 flex-none items-center justify-center rounded-xl text-text-secondary hover:bg-surface hover:text-text-primary"
        >
          <Eye className="h-5 w-5" aria-hidden />
        </a>
        {d.status !== 'cancelled' && (
          <Button size="sm" variant={d.status === 'live' ? 'secondary' : 'primary'} onClick={toggle} disabled={busy} data-qf-focus>
            {busy ? '…' : d.status === 'live' ? 'Hide' : 'Put it live'}
          </Button>
        )}
      </div>
      {error && <p className="text-caption text-error">{error}</p>}
    </div>
  );
}

function CheckInBox({ onDone }: { onDone: () => void }) {
  const [value, setValue] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const go = async () => {
    if (!value.trim()) return;
    setBusy(true);
    try {
      const r = await checkInDropPass(value.trim());
      setMsg({
        ok: true,
        text: `${r.outcome === 'already' ? 'Already checked in' : 'Checked in'}: ${r.holderName}, ${r.seats} ${r.seats === 1 ? 'seat' : 'seats'}. Collect ${rupees(r.balanceDue)}.`,
      });
      setValue('');
      onDone();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error)?.message || 'That pass didn’t work.' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card elevation="resting">
      <CardContent className="flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-heading text-h3 font-bold text-text-primary">Check someone in</h2>
          <Link href="/owner/scanner" className="inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-4 font-semibold text-white hover:bg-primary-dark">
            <QrCode className="h-4 w-4" aria-hidden /> Scan their pass
          </Link>
        </div>
        <div className="flex gap-2">
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && go()}
            placeholder="Or paste the pass link"
            aria-label="Pass link"
            className="h-11 min-w-0 flex-1 rounded-xl border border-border bg-card px-3 text-body text-text-primary"
          />
          <Button variant="secondary" onClick={go} disabled={busy || !value.trim()}>
            Check in
          </Button>
        </div>
        {msg && <p className={`text-body font-semibold ${msg.ok ? 'text-success' : 'text-error'}`}>{msg.text}</p>}
      </CardContent>
    </Card>
  );
}

function RowCheckIn({ token, onDone }: { token: string; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await checkInDropPass(token);
          onDone();
        } finally {
          setBusy(false);
        }
      }}
      className="h-11 rounded-lg bg-primary px-3 text-caption font-semibold text-white hover:bg-primary-dark disabled:opacity-60"
    >
      {busy ? '…' : 'Check in'}
    </button>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-0 rounded-2xl border border-border bg-card px-3 py-2.5">
      <p className="truncate text-caption text-text-secondary">{label}</p>
      <p className="font-heading text-h3 font-bold leading-tight text-text-primary">{value}</p>
      {hint && <p className="truncate text-[11px] text-text-secondary">{hint}</p>}
    </div>
  );
}

function Funnel({ d }: { d: OwnerDrop }) {
  const f = d.funnel;
  const steps = [
    ['Opened the page', f.pageViews],
    ['Picked a time', f.blockSelected],
    ['Started paying', f.paymentStarted],
    ['Paid', f.paymentSuccess],
  ] as const;
  const top = Math.max(1, ...steps.map(([, n]) => n));
  const channels = Object.entries(f.shareByChannel).sort((a, b) => b[1] - a[1]);
  const names: Record<string, string> = { whatsapp: 'WhatsApp', copy_link: 'Copy link', map: 'Map', calendar: 'Calendar', story: 'Story pic' };
  return (
    <Card elevation="resting">
      <CardContent className="flex flex-col gap-3 p-4">
        <h2 className="font-heading text-h3 font-bold text-text-primary">How people found it</h2>
        <ul className="flex flex-col gap-2">
          {steps.map(([label, n]) => (
            <li key={label}>
              <div className="flex justify-between text-body text-text-primary">
                <span>{label}</span>
                <span className="font-semibold">{n}</span>
              </div>
              <div className="mt-1 h-2 rounded-full bg-surface">
                <div className="h-2 rounded-full bg-primary" style={{ width: `${Math.min(100, (n / top) * 100)}%` }} />
              </div>
            </li>
          ))}
        </ul>
        <p className="text-body text-text-primary">
          Shared {f.shareClicked} {f.shareClicked === 1 ? 'time' : 'times'}
          {channels.length > 0 && <span className="text-text-secondary">: {channels.map(([c, n]) => `${names[c] ?? c} ${n}`).join(', ')}</span>}
        </p>
      </CardContent>
    </Card>
  );
}
