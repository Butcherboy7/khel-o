'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ImagePlus } from 'lucide-react';
import { uploadCafePhoto } from '@/lib/api/settings';
import { ArrowLeft, Bell, CheckCircle2, Download, ExternalLink, KeyRound, QrCode } from 'lucide-react';
import { Button, Card, CardContent, Input, Modal, SkeletonCard } from '@/components/ui';
import { ShareIconRow, WhatsAppButton } from '@/components/shared/ShareActions';
import { OwnerPageHeader } from '@/components/owner/OwnerPageHeader';
import { OwnerLoadError } from '@/components/owner/OwnerLoadError';
import { cancelDrop, checkInDropPass, downloadDropCsv, getOwnerDrop, getWalkInQr, giveAwayReservation, updateDrop, type OwnerDrop } from '@/lib/api/drops';
import { blockTimes, clockRange, dayLabel, rupees, whenText } from '@/lib/drops';
import { OfflineBooking, RemoveOffline } from '@/components/drops/OfflineBooking';

const STATUS_LABEL: Record<string, string> = {
  pending_payment: 'Paying now',
  confirmed: 'Paid',
  checked_in: 'Here',
  refunded: 'Refunded',
  given_away: 'Seat given away',
};

const GRACE_MS = 15 * 60_000;

const ymd = (dt: Date) => dt.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
const addDays = (iso: string, n: number) => ymd(new Date(new Date(`${iso}T12:00:00+05:30`).getTime() + n * 86_400_000));

/** Prices can change any time, even live. Reservations already made keep the price they were made at. */
function EditPrices({ d, onDone }: { d: OwnerDrop; onDone: () => void }) {
  const [price, setPrice] = useState(String(d.pricePerHour));
  const [short, setShort] = useState(String(d.deposit));
  const [long, setLong] = useState(String(d.depositLong));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const changed = Number(price) !== d.pricePerHour || Number(short) !== d.deposit || Number(long) !== d.depositLong;
  const save = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await updateDrop(d.id, { pricePerHour: Number(price), depositAmount: Number(short), depositAmountLong: Number(long) });
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
    <Card elevation="flat" data-tour="drop-prices">
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
        <p className="text-caption text-text-secondary">The booking fee is what people pay online to hold a seat. It comes off their bill. You can change these any time, even while the drop is live. People who already reserved keep the price they booked at.</p>
        <div className="flex items-center gap-3">
          <Button onClick={save} disabled={busy || !changed || !Number(price)}>Save prices</Button>
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
      setMsg({ ok: true, text: 'Saved. It is live on your page and on the home Drops tab.' });
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
        <p className="text-caption text-text-secondary">
          Add a photo of people playing GTA 6 at your café. It replaces the Rockstar picture on your page and on the home Drops tab, so people see your place.
        </p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {own && <img src={d.coverImageUrl!} alt="Your drop photo" className="aspect-[16/9] w-full rounded-xl object-cover" />}
        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-xl bg-primary px-4 font-semibold text-white">
            <ImagePlus className="h-4 w-4" /> {busy ? 'Uploading…' : own ? 'Change photo' : 'Add a photo'}
            <input type="file" accept="image/*" className="hidden" disabled={busy} onChange={(e) => pick(e.target.files?.[0])} />
          </label>
          {own && (
            <button type="button" disabled={busy} onClick={() => set('').then(() => setMsg({ ok: true, text: 'Back to the Rockstar picture.' }))} className="text-body font-semibold text-text-secondary underline">
              Use the Rockstar picture
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
    <Card elevation="flat" data-tour="drop-seats">
      <CardContent className="flex flex-col gap-3 p-4">
        <p className="font-heading text-body-emphasis font-bold text-text-primary">Seats at one time</p>
        <p className="text-caption text-text-secondary">How many people can play together. This is how many consoles you give to the drop.</p>
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
        <p className="text-caption text-text-secondary">
          Use this only if you cannot run it. Every person who paid gets all their money back, by themselves. It cannot be undone.
        </p>
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
        <p className="text-caption text-text-secondary">
          New days appear by themselves (players see the next 7). The longest a drop can run is until {nice(hardEnd)}. After it ends, booking is normal.
        </p>
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
    <Card elevation="resting" data-tour="drop-share">
      <CardContent className="flex flex-col gap-3 p-4">
        <div>
          <p className="font-heading text-body-emphasis font-bold text-text-primary">Share your drop</p>
          <p className="text-caption text-text-secondary">
            {hidden
              ? 'This drop is hidden. Put it live first, then send this link.'
              : 'Send this link to your regulars and post it on your Instagram. Everyone who opens it can reserve.'}
          </p>
        </div>
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
        <p className="font-semibold text-text-primary">Counter code for walk-ins</p>
        <p className="text-caption text-text-secondary">
          Someone walks in and wants a free seat? Show this. They scan, pay the booking fee, and the seat shows up on your list and is taken off for everyone else.
        </p>
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
    <Card elevation="flat" data-tour="drop-details">
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
        <p className="text-caption text-text-secondary">Times are café time (India). The daily hours and the rig cannot change once the drop is made: make a new drop for that.</p>
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
  const { data: d, isLoading, error, refetch } = useQuery({ queryKey: key, queryFn: () => getOwnerDrop(id), refetchInterval: 30_000 });
  const refresh = () => qc.invalidateQueries({ queryKey: key });

  if (isLoading) return <SkeletonCard />;
  if (error || !d) return <OwnerLoadError error={error} title="Couldn’t load this drop" onRetry={() => refetch()} />;

  return (
    <div className="flex flex-col gap-6">
      <Link href={base} className="inline-flex min-h-[44px] items-center gap-1 self-start text-body font-semibold text-text-secondary hover:text-text-primary">
        <ArrowLeft className="h-4 w-4" /> All drops
      </Link>
      <OwnerPageHeader
        guide={admin ? undefined : 'drop'}
        title={d.title}
        description={`${d.cafe.name} · ${d.playsOn ? `on ${d.playsOn} · ` : ''}${rupees(d.pricePerHour)} an hour · ${rupees(d.deposit)} booking fee a seat`}
        action={
          <a
            href={`/drops/${d.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-border px-4 font-semibold text-text-primary hover:bg-surface sm:w-auto"
          >
            <ExternalLink className="h-4 w-4" /> See what customers see
          </a>
        }
      />

      <StatusCard d={d} onChanged={refresh} />

      {d.status !== 'cancelled' && <ShareDrop d={d} />}

      <OfflineBooking d={d} onDone={refresh} />

      <div className="grid grid-cols-3 gap-2" data-tour="drop-stats">
        <Stat label="Seats sold" value={`${d.totals.seatsSold} of ${d.seatsTotal}`} />
        <Stat label="Here" value={String(d.totals.checkedIn)} />
        <Stat label="Collect at café" value={rupees(d.totals.balanceToCollect)} />
      </div>
      {(d.totals.offlineSeats ?? 0) > 0 && (
        <p className="-mt-3 text-caption text-text-secondary">
          Includes {d.totals.offlineSeats} {d.totals.offlineSeats === 1 ? 'seat' : 'seats'} you sold at the café ({rupees(d.totals.offlineCollected ?? 0)} cash, already in your hand).
        </p>
      )}

      <div data-tour="drop-checkin">
        <CheckInBox onDone={refresh} />
      </div>

      <div className="flex items-center justify-between gap-3" data-tour="drop-who">
        <h2 className="font-heading text-h2 font-semibold text-text-primary">Who is coming</h2>
        <Link href="/owner/availability" className="text-body font-semibold text-primary">Hour by hour</Link>
      </div>
      {d.blocks.every((b) => b.reservations.length === 0) && (
        <p className="rounded-2xl border border-border bg-card p-4 text-body text-text-secondary">
          No reservations yet. Send your link with the Share buttons above.
        </p>
      )}

      {d.blocks.filter((b) => b.reservations.length > 0).map((b) => (
        <Card key={b.id} elevation="resting">
          <CardContent className="flex flex-col gap-3 p-5">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="font-heading text-h3 font-bold text-text-primary">{dayLabel(b.date)}</h2>
              <p className="text-body font-semibold text-text-primary">
                {b.seatsTotal - b.seatsLeft} of {b.seatsTotal} taken
              </p>
            </div>
            <p className="-mt-2 text-body text-text-secondary">{blockTimes(b)} · {rupees(b.pricePerSeat)} a seat</p>
            {b.reservations.length === 0 ? (
              <p className="text-caption text-text-secondary">No reservations yet.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-border rounded-xl border border-border">
                {b.reservations.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold text-text-primary">
                        {r.name} · {r.seats} {r.seats === 1 ? 'seat' : 'seats'}
                      </span>
                      <span className="block text-caption text-text-secondary">
                        {r.reference}
                        {r.hours && r.startTime && r.endTime ? ` · ${clockRange(r.startTime, r.endTime)} (${r.hours} hr)` : ''}
                        {r.phone ? <> · <a href={`tel:${r.phone}`} className="font-semibold text-primary underline">Call {r.phone}</a></> : null}
                        {r.earlyAccess ? ' · early access' : ''}
                        {r.source === 'offline' ? ` · sold at the café${r.price ? `, ${rupees(r.price)} cash taken` : ''}${r.note ? ` · ${r.note}` : ''}` : r.status === 'confirmed' || r.status === 'checked_in' ? ` · collect ${rupees(r.balanceDue)}` : ''}
                      </span>
                    </span>
                    {r.status === 'confirmed' && r.checkinToken ? (
                      <span className="flex items-center gap-2">
                        {r.source === 'offline' && <RemoveOffline id={r.id} name={r.name} onDone={refresh} />}
                        {Date.now() >= new Date(`${b.date}T${r.startTime ?? b.startTime}:00+05:30`).getTime() + GRACE_MS && <GiveAway id={r.id} name={r.name} onDone={refresh} />}
                        <RowCheckIn token={r.checkinToken} onDone={refresh} />
                      </span>
                    ) : (
                      <span
                        className={`text-caption font-semibold ${r.status === 'checked_in' ? 'text-success' : r.status === 'refunded' ? 'text-error' : 'text-text-secondary'}`}
                      >
                        {r.status === 'checked_in' && <CheckCircle2 className="mr-1 inline h-3.5 w-3.5" />}
                        {STATUS_LABEL[r.status] ?? r.status}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      ))}

      <h2 className="font-heading text-h2 font-semibold text-text-primary">Settings</h2>
      <div className="grid gap-4 md:grid-cols-2">
        {d.status !== 'cancelled' && <EditDetails d={d} onDone={refresh} />}
        <EditPrices d={d} onDone={refresh} />
        {d.rolling && <SeatsPerDay d={d} onDone={refresh} />}
        <CoverPhoto d={d} onDone={refresh} />
        {d.rolling && d.endsOn && d.startsOn && <RunControl d={d} onDone={refresh} />}
      </div>

      <Funnel d={d} />

      <Button variant="secondary" onClick={() => downloadDropCsv(d.id, d.slug)} className="self-start">
        <Download className="mr-1.5 h-4 w-4" /> Download the list (CSV)
      </Button>

      <CancelDrop d={d} onDone={refresh} />
    </div>
  );
}

function StatusCard({ d, onChanged }: { d: OwnerDrop; onChanged: () => void }) {
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
  return (
    <Card elevation="flat">
      <CardContent className="flex flex-col gap-2 p-4 text-body text-text-primary">
        <p className="font-semibold">
          {d.status === 'draft'
            ? 'Draft: only you can see it.'
            : d.status === 'cancelled'
            ? 'Cancelled.'
            : d.state === 'open'
            ? 'Open: anyone can reserve.'
            : d.state === 'early'
            ? 'Early access: only people with the code can reserve.'
            : 'Live, but reservations haven’t opened yet.'}
        </p>
        <p className="text-text-secondary">Everyone can reserve from {whenText(d.publicStartsAt)}.</p>
        {d.earlyAccessCode && (
          <p className="flex items-center gap-1.5 text-text-secondary">
            <KeyRound className="h-4 w-4" /> Early access from {whenText(d.earlyAccessStartsAt)} with code{' '}
            <span className="font-mono font-bold text-text-primary">{d.earlyAccessCode}</span>
          </p>
        )}
        <p className="flex items-center gap-1.5 text-text-secondary">
          <Bell className="h-4 w-4" /> {d.waitlistCount} {d.waitlistCount === 1 ? 'person' : 'people'} asked to be told when it opens
        </p>
        {d.status !== 'cancelled' && (
          <Button variant={d.status === 'live' ? 'secondary' : 'primary'} onClick={toggle} disabled={busy} className="mt-1 self-start">
            {d.status === 'live' ? 'Hide it (back to draft)' : 'Put it live'}
          </Button>
        )}
        {error && <p className="text-error">{error}</p>}
      </CardContent>
    </Card>
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
      <CardContent className="flex flex-col gap-3 p-5">
        <h2 className="flex items-center gap-2 font-heading text-h3 font-bold text-text-primary">
          <QrCode className="h-5 w-5" /> Check someone in
        </h2>
        <p className="text-body text-text-secondary">
          Scan their pass in{' '}
          <Link href="/owner/scanner" className="font-semibold text-primary underline-offset-2 hover:underline">
            Scan &amp; Check-in
          </Link>
          , or point your phone camera at it and tap Check in. You can also paste the pass link here.
        </p>
        <div className="flex gap-2">
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && go()}
            placeholder="Pass link"
            aria-label="Pass link"
            className="h-11 min-w-0 flex-1 rounded-xl border border-border bg-card px-3 text-body text-text-primary"
          />
          <Button onClick={go} disabled={busy || !value.trim()}>
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-3">
      <p className="text-caption text-text-secondary">{label}</p>
      <p className="font-heading text-h3 font-bold text-text-primary">{value}</p>
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
  const top = Math.max(1, f.pageViews);
  const channels = Object.entries(f.shareByChannel).sort((a, b) => b[1] - a[1]);
  const names: Record<string, string> = { whatsapp: 'WhatsApp', copy_link: 'Copy link', map: 'Map', calendar: 'Calendar', story: 'Story pic' };
  return (
    <Card elevation="resting">
      <CardContent className="flex flex-col gap-3 p-5">
        <h2 className="font-heading text-h3 font-bold text-text-primary">How people got here</h2>
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
