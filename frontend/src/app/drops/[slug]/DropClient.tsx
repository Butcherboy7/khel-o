'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Bell, Check, Clock, KeyRound, MapPin, Minus, Plus, Ticket } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { useRazorpay } from '@/hooks/useRazorpay';
import { MockPaymentModal } from '@/components/MockPaymentModal';
import { CheckoutSignInSheet } from '@/components/auth/CheckoutSignInSheet';
import { trackAction } from '@/lib/api/analyticsEvents';
import {
  getDrop,
  joinDropWaitlist,
  reserveDrop,
  verifyDropPayment,
  type Drop,
  type DropBlock,
  type DropReservation,
} from '@/lib/api/drops';
import { blockEnd, blockStart, blockTimes, clock, dayLabel, rupees, whenText } from '@/lib/drops';
import { calculateWindowRemainingSeats, timeToMinutes } from '@/lib/format';
import { CommunityButton, CommunityInviteCard, LastChallengeLink } from '@/components/customer/CommunityInvite';
import { CustomerShell } from '@/components/layout/CustomerShell';
import { TimelineRangePicker } from '@/components/customer/TimelineRangePicker';
import { ShareIconRow, WhatsAppButton, type ShareChannel } from '@/components/shared/ShareActions';

const REFRESH_MS = 20_000;
const codeKey = (slug: string) => `khelo_drop_code_${slug}`;
const GTA_ART = '/drops/gta6-landscape.jpg';

const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
const lengthText = (h: number) => (Number.isInteger(h) ? `${h} hr` : `${Math.floor(h)} hr 30`);

export function DropClient({ slug, initial }: { slug: string; initial: Drop | null }) {
  const router = useRouter();
  const params = useSearchParams();
  const { isAuthenticated, isHydrated, user } = useAuthStore();
  const { displayRazorpay, mockModalState } = useRazorpay();

  const [drop, setDrop] = useState<Drop | null>(initial);
  const [missing, setMissing] = useState(false);
  const [blockId, setBlockId] = useState<string | null>(params.get('block'));
  const [seats, setSeats] = useState(Math.max(1, Number(params.get('seats')) || 1));
  const [startTime, setStartTime] = useState<string | null>(params.get('start'));
  const [hours, setHours] = useState(Number(params.get('hours')) || 1);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [code, setCode] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justPaid, setJustPaid] = useState<string | null>(null);
  const [signInOpen, setSignInOpen] = useState(false);
  const reserveAfterSignIn = useRef(false);
  const reserveRef = useRef<() => void>(() => {});
  const viewed = useRef(false);
  const daysRef = useRef<HTMLElement | null>(null);
  const scrolled = useRef(false);

  const track = useCallback(
    (action: string, meta: Record<string, unknown> = {}) => trackAction(action, { drop: slug, ...meta }, drop?.cafe.id),
    [slug, drop?.cafe.id],
  );
  const onShare = useCallback((channel: ShareChannel, where = 'page') => track('drop_share_clicked', { channel, where }), [track]);

  // The early access code can come in the link (?code=) and survives the sign-in detour.
  useEffect(() => {
    const fromLink = params.get('code');
    let saved = '';
    try {
      saved = sessionStorage.getItem(codeKey(slug)) || '';
    } catch {}
    setCode(fromLink || saved);
  }, [params, slug]);
  useEffect(() => {
    try {
      if (code) sessionStorage.setItem(codeKey(slug), code);
    } catch {}
  }, [code, slug]);

  const load = useCallback(() => {
    if (typeof document !== 'undefined' && document.hidden) return;
    getDrop(slug)
      .then((d) => {
        setDrop(d);
        setMissing(false);
      })
      .catch(() => setMissing((m) => m || !drop));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  // Fresh seat counts while the page is open, and the person's own seats once signed in.
  useEffect(() => {
    if (!isHydrated) return;
    load();
    const t = setInterval(load, REFRESH_MS);
    return () => clearInterval(t);
  }, [isHydrated, isAuthenticated, load]);

  useEffect(() => {
    if (!drop || viewed.current) return;
    viewed.current = true;
    track('drop_page_view', { state: drop.state });
  }, [drop, track]);

  // Opening a live drop lands on the day and time picker, where the booking happens.
  useEffect(() => {
    if (scrolled.current || !drop || !(drop.state === 'open' || drop.state === 'early')) return;
    if (window.location.hash || drop.myReservations.length > 0) return;
    scrolled.current = true;
    const t = setTimeout(() => daysRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 600);
    return () => clearTimeout(t);
  }, [drop]);

  const flex = !!drop?.maxHours;
  const block = drop?.blocks.find((b) => b.id === blockId) ?? null;
  const booked = useMemo(() => block?.bookedSlots ?? [], [block]);
  // The cap is per day: seats on one night never stop you booking another night.
  const seatsHeld = (drop?.myReservations ?? [])
    .filter((r) => r.blockId === block?.id)
    .filter((r) => r.status === 'confirmed' || r.status === 'checked_in' || r.status === 'pending_payment')
    .reduce((n, r) => n + r.seats, 0);
  const seatsAllowed = drop ? Math.max(0, drop.maxSeatsPerUser - seatsHeld) : 0;

  // Flexible: free seats for the exact window picked, counted the same way the booking slider does.
  const windowFree = useMemo(() => {
    if (!block || !startTime) return 0;
    const s = timeToMinutes(startTime);
    return calculateWindowRemainingSeats(block.seatsTotal, booked, s, s + Math.round(hours * 60));
  }, [block, booked, startTime, hours]);
  const sessionLeft = (b: DropBlock) =>
    flex && b.bookedSlots ? Math.max(0, ...hourRange(b).map((m) => b.seatsTotal - peakAt(b, m))) : b.seatsLeft;
  const maxSeats = Math.max(1, Math.min(seatsAllowed, flex ? windowFree : block?.seatsLeft ?? 1));
  const seatCount = Math.min(seats, maxSeats);

  const feePerSeat = !drop ? 0 : flex ? (hours <= 3 ? drop.deposit : drop.depositLong) : drop.deposit;
  const totalPerSeat = !drop || !block ? 0 : flex ? drop.pricePerHour * hours : block.pricePerSeat;
  const payNow = feePerSeat * seatCount;
  const total = totalPerSeat * seatCount;

  const pick = (b: DropBlock) => {
    if (b.started || sessionLeft(b) === 0) return;
    setBlockId(b.id);
    setError(null);
    // Pre-pick the best open slot so one tap reserves: an evening 2-hour slot if there is one.
    const ok = (m: number, len: number) =>
      m + len <= timeToMinutes(b.endTime) && b.seatsTotal - peakIn(b, m, m + len) >= 1 && new Date(`${b.date}T${hhmm(m)}:00+05:30`).getTime() > Date.now();
    const slots = b.bookedSlots ? hourRange(b) : [];
    const evening = slots.find((m) => m >= 18 * 60 && ok(m, 120));
    const any2 = slots.find((m) => ok(m, 120));
    const any1 = slots.find((m) => ok(m, 60));
    if (flex) {
      const m = evening ?? any2 ?? any1;
      setStartTime(m != null ? hhmm(m) : b.startTime);
      setHours(evening != null || any2 != null ? 2 : 1);
    }
    track('drop_block_selected', { block: b.id, date: b.date });
  };

  // Signed in from the sheet: carry on to payment with every pick kept.
  useEffect(() => {
    if (reserveAfterSignIn.current && isAuthenticated) {
      reserveAfterSignIn.current = false;
      reserveRef.current();
    }
  }, [isAuthenticated]);

  // Land on the first open day so the slider is already there.
  useEffect(() => {
    if (!drop || blockId || !drop.blocks.length) return;
    const b = drop.blocks.find((x) => !x.started && sessionLeft(x) > 0);
    if (b && drop.maxHours) pick(b);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drop?.id]);

  if (!drop) {
    return (
      <CustomerShell>
        <p className="mt-16 text-center text-text-secondary">{missing ? 'We couldn’t find this drop.' : 'Loading…'}</p>
        {missing && (
          <Link href="/" className="mt-4 block text-center font-semibold text-primary">
            Go to KHEL-O
          </Link>
        )}
      </CustomerShell>
    );
  }

  const pageUrl = typeof window !== 'undefined' ? window.location.href.split('?')[0] : `/drops/${drop.slug}`;
  const shareText = `${drop.title} at ${drop.cafe.name}. ${drop.seatsPerSlot ? `Only ${drop.seatsPerSlot} seats a night` : `${drop.seatsLeft} seats left`}. Reserve yours:`;
  const canReserve = drop.state === 'open' || drop.state === 'early';
  const ended = drop.state === 'ended';
  const needsCode = drop.state === 'early' && drop.hasEarlyAccessCode;
  const paid = drop.myReservations.filter((r) => r.status === 'confirmed' || r.status === 'checked_in');
  const pending = drop.myReservations.find((r) => r.status === 'pending_payment' && r.expiresAt && new Date(r.expiresAt) > new Date());
  const firstBlock = paid[0]?.block ?? block ?? drop.blocks.find((b) => !b.started) ?? drop.blocks[0];
  const art = drop.coverImageUrl || (/gta/i.test(drop.game) ? GTA_ART : null);
  const endLabel = startTime ? hhmm(timeToMinutes(startTime) + Math.round(hours * 60)) : '';

  const pay = (reservation: DropReservation, order: { orderId: string; amount: number; currency: string; keyId?: string }) => {
    displayRazorpay({
      order_id: order.orderId,
      amount: order.amount * 100,
      currency: order.currency,
      key: order.keyId,
      name: 'KHEL-O',
      description: `${drop.title}: ${reservation.seats} ${reservation.seats === 1 ? 'seat' : 'seats'}`,
      prefill: { name: user?.fullName, email: user?.email, contact: user?.phoneNumber || phone || undefined },
      onDismiss: () => {
        setBusy(false);
        load();
      },
      handler: async (rsp) => {
        try {
          const done = await verifyDropPayment({
            razorpayOrderId: rsp.razorpay_order_id,
            razorpayPaymentId: rsp.razorpay_payment_id,
            razorpaySignature: rsp.razorpay_signature,
          });
          if (done.reservation.status === 'refunded') {
            setError('Your payment came in after the 10-minute hold ended and the seats were gone, so we refunded it. It reaches you in 5–7 days.');
          } else {
            setJustPaid(done.reservation.id);
            setBlockId(null);
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }
        } catch (e) {
          setError((e as Error)?.message || 'We couldn’t confirm this payment.');
        } finally {
          setBusy(false);
          load();
        }
      },
    });
  };

  const back = () => {
    const q = new URLSearchParams();
    if (block) q.set('block', block.id);
    q.set('seats', String(seatCount));
    if (flex && startTime) {
      q.set('start', startTime);
      q.set('hours', String(hours));
    }
    return `/drops/${drop.slug}?${q.toString()}`;
  };

  const reserve = async () => {
    if (!block) return;
    if (!isAuthenticated) {
      setSignInOpen(true);
      return;
    }
    if (needsCode && !code.trim()) {
      setError('Type the early access code first.');
      return;
    }
    if (flex && (!startTime || windowFree < seatCount)) {
      setError('Pick a time that still has a free seat.');
      return;
    }
    if (drop.needsPhone && phone.replace(/\D/g, '').length < 10) {
      setError('Type your 10-digit mobile number so the café can reach you.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const done = await reserveDrop(drop.slug, {
        blockId: block.id,
        seats: seatCount,
        code: code.trim() || undefined,
        startTime: flex ? startTime ?? undefined : undefined,
        hours: flex ? hours : undefined,
        phone: drop.needsPhone ? phone : undefined,
      });
      pay(done.reservation, done.order);
    } catch (e) {
      setError((e as Error)?.message || 'Something went wrong. Please try again.');
      setBusy(false);
      load();
    }
  };

  reserveRef.current = reserve;

  const err = error && <p className="rounded-xl bg-error/10 px-3 py-2 text-body text-error">{error}</p>;

  return (
    <CustomerShell>
      <div className="mx-auto flex max-w-xl flex-col gap-4 pb-28">
        {/* Banner */}
        <section>
          <div className="overflow-hidden rounded-2xl border border-border/70 shadow-card">
            {art ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={art} alt={`${drop.game} artwork`} className="aspect-video w-full object-cover" />
            ) : (
              <div className="aspect-video w-full bg-gradient-to-br from-primary/80 to-secondary/70" aria-hidden />
            )}
          </div>
          <p className="mt-3 text-caption font-bold uppercase tracking-wider text-primary">Launch drop</p>
          <h1 className="font-heading text-h1 font-bold text-text-primary">{drop.title}</h1>
          {/* Where it happens, big: people book the game and miss which café it is */}
          <a
            href={drop.cafe.mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 flex items-center gap-3 rounded-2xl border border-primary/30 bg-primary/5 px-3.5 py-3"
          >
            <span className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-primary text-white">
              <MapPin className="h-5 w-5" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-heading text-h2 font-bold leading-tight text-text-primary">{drop.cafe.name}</span>
              <span className="block truncate text-caption text-text-secondary">{drop.cafe.address || drop.cafe.city}</span>
            </span>
            <span className="flex-shrink-0 text-caption font-bold text-primary">Map</span>
          </a>
          {drop.tagline && <p className="mt-1 text-body text-text-secondary">{drop.tagline}</p>}
          <div className="mt-3 flex flex-wrap gap-2 text-caption font-semibold text-text-primary">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5">
              <Ticket className="h-3.5 w-3.5 text-primary" /> {drop.seatsPerSlot ? `${drop.seatsPerSlot} seats at a time, every night` : `${drop.seatsLeft} of ${drop.seatsTotal} seats left`}
            </span>
            {drop.playsOn && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-3 py-1.5 text-primary">
                Play on {drop.playsOn}
              </span>
            )}
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5">
              {rupees(drop.pricePerHour)} an hour
            </span>
            {(drop.reservedCount ?? 0) >= 3 && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-success/40 bg-success/10 px-3 py-1.5 text-success">
                {drop.reservedCount} gamers reserved
              </span>
            )}
            {drop.endsOn && drop.state !== 'ended' && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-error/30 bg-error/10 px-3 py-1.5 text-error">
                Until {new Date(`${drop.endsOn}T12:00:00+05:30`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })} only
              </span>
            )}
          </div>
          {art === GTA_ART && <p className="mt-2 text-[11px] text-text-secondary">Grand Theft Auto VI artwork © Rockstar Games.</p>}
        </section>

        {/* Your seats */}
        {paid.filter((r) => r.id === justPaid).map((r) => (
          <Confirmation key={r.id} drop={drop} r={r} fresh onShare={onShare} pageUrl={pageUrl} />
        ))}
        {paid.some((r) => r.id !== justPaid) && <MySeats drop={drop} list={paid.filter((r) => r.id !== justPaid)} />}
        {pending && !busy && (
          <div className="rounded-2xl border border-warning/40 bg-warning/10 p-4">
            <p className="font-semibold text-text-primary">
              {pending.seats} {pending.seats === 1 ? 'seat' : 'seats'} held for you · <Countdown to={pending.expiresAt!} />
            </p>
            <p className="mt-1 text-body text-text-secondary">Pay {rupees(pending.deposit)} to keep them. If you don’t, they go back to everyone.</p>
            {pending.orderId && (
              <button
                type="button"
                onClick={() => {
                  setBusy(true);
                  pay(pending, { orderId: pending.orderId!, amount: pending.deposit, currency: 'INR' });
                }}
                className="mt-3 inline-flex h-12 w-full items-center justify-center rounded-xl bg-primary font-bold text-white"
              >
                Pay {rupees(pending.deposit)} now
              </button>
            )}
          </div>
        )}

        {/* When reservations open */}
        {drop.state === 'soon' && <Waitlist drop={drop} onJoined={load} text={`Reservations open on ${whenText(drop.publicStartsAt)}.`} />}
        {drop.state === 'early' && (
          <div className="rounded-2xl border border-secondary/40 bg-secondary/10 px-4 py-3 text-body">
            <p className="flex items-center gap-2 font-semibold text-text-primary">
              <KeyRound className="h-4 w-4 text-secondary" /> Early access is on
            </p>
            <p className="mt-1 text-text-secondary">
              Only people with the early access code can reserve now. Everyone else can reserve from {whenText(drop.publicStartsAt)}.
            </p>
          </div>
        )}
        {ended && (
          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="font-heading text-body-emphasis font-bold text-text-primary">The launch drop is over</p>
            <p className="mt-1 text-body text-text-secondary">You can still play it. Book a normal slot at {drop.cafe.name}.</p>
            <Link href={`/cafe/${drop.cafe.slug || drop.cafe.id}`} className="mt-3 inline-flex h-12 w-full items-center justify-center rounded-xl bg-primary font-bold text-white">
              Book a slot at {drop.cafe.name}
            </Link>
          </div>
        )}
        {drop.state === 'cancelled' && (
          <p className="rounded-2xl border border-error/30 bg-error/10 px-4 py-3 text-body text-text-primary">
            This drop was cancelled. Anyone who paid gets their money back.
          </p>
        )}

        {/* How it works: three taps, shown before anything else asks for effort */}
        {canReserve && (
          <ol className="grid grid-cols-3 gap-2 text-center text-caption font-semibold text-text-primary" aria-label="How to reserve">
            {['Pick a day', 'Drag your hours', 'Tap Reserve now'].map((t, i) => (
              <li key={t} className="flex flex-col items-center gap-1 rounded-xl border border-border bg-card px-2 py-2.5">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-[12px] font-extrabold text-white">{i + 1}</span>
                {t}
              </li>
            ))}
          </ol>
        )}

        {/* Day */}
        {!ended && (
        <section ref={daysRef} className="scroll-mt-20">
          <h2 className="font-heading text-h2 font-semibold text-text-primary">{canReserve ? 'Pick a day' : 'Days'}</h2>
          {flex && drop.blocks[0] && (
            <p className="text-caption text-text-secondary">Open {clock(drop.blocks[0].startTime)} – {clock(drop.blocks[0].endTime)}, every day</p>
          )}
          <div className="mt-2 grid grid-cols-4 gap-2" role="radiogroup" aria-label="Days">
            {drop.blocks.map((b) => {
              const gone = b.started || sessionLeft(b) === 0;
              const on = b.id === blockId;
              return (
                <button
                  key={b.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  disabled={!canReserve || gone}
                  onClick={() => pick(b)}
                  className={`min-h-[64px] rounded-xl border px-1.5 py-2 text-center transition-colors ${
                    on ? 'border-primary bg-primary/10' : 'border-border bg-card'
                  } ${gone ? 'opacity-50' : canReserve ? 'hover:border-primary/50' : ''}`}
                >
                  <span className="block text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
                    {new Date(`${b.date}T12:00:00+05:30`).toLocaleDateString('en-IN', { weekday: 'short', timeZone: 'Asia/Kolkata' })}
                  </span>
                  <span className="block font-heading text-body-emphasis font-bold leading-tight text-text-primary">
                    {new Date(`${b.date}T12:00:00+05:30`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })}
                  </span>
                  <span className={`block text-[11px] ${gone ? 'text-error' : 'text-text-secondary'}`}>
                    {b.started ? 'Started' : sessionLeft(b) === 0 ? 'Full' : flex ? ' ' : `${clock(b.startTime)}`}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
        )}

        {/* Time and length: the same slider as a normal booking */}
        {canReserve && block && flex && startTime && (
          <TimelineRangePicker
            openingTime={`${block.startTime}:00`}
            closingTime={`${block.endTime}:00`}
            selectedDate={block.date}
            startTime={startTime}
            durationHours={hours}
            onChange={(s, h) => {
              setStartTime(s.slice(0, 5));
              setHours(h);
              setError(null);
            }}
            bookedSlots={booked}
            totalSeats={block.seatsTotal}
            requestedSeats={seatCount}
            remainingSeats={windowFree}
            skipCoachmark={false}
            minDurationMinutes={60}
            maxDurationMinutes={(drop.maxHours ?? 5) * 60}
            stepMinutes={30}
          >
            <div className="flex items-center justify-between gap-3 py-1.5">
              <div className="min-w-0">
                <span className="font-heading text-body font-bold text-text-primary">How many seats?</span>
                <p className="truncate text-caption text-text-secondary">Up to {drop.maxSeatsPerUser} a day · {windowFree} free at this time</p>
              </div>
              <span className="flex items-center gap-3">
                <button
                  type="button"
                  aria-label="One seat less"
                  onClick={() => setSeats(Math.max(1, seatCount - 1))}
                  disabled={seatCount <= 1}
                  className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-card disabled:opacity-40"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <span className="w-6 text-center text-lg font-bold text-text-primary" aria-live="polite">{seatCount}</span>
                <button
                  type="button"
                  aria-label="One seat more"
                  onClick={() => setSeats(Math.min(maxSeats, seatCount + 1))}
                  disabled={seatCount >= maxSeats}
                  className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-card disabled:opacity-40"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </span>
            </div>
          </TimelineRangePicker>
        )}

        {/* Older whole-session drops keep the simple seat stepper */}
        {canReserve && block && !flex && (
          <section className="rounded-2xl border border-border bg-card p-4">
            <p className="flex items-center gap-1.5 text-body text-text-secondary">
              <Clock className="h-4 w-4" /> {blockTimes(block)}
            </p>
            <div className="mt-3 flex items-center justify-between">
              <span className="font-semibold text-text-primary">Seats</span>
              <span className="flex items-center gap-3">
                <button type="button" aria-label="One seat less" onClick={() => setSeats(Math.max(1, seatCount - 1))} disabled={seatCount <= 1}
                  className="flex h-11 w-11 items-center justify-center rounded-full border border-border disabled:opacity-40"><Minus className="h-4 w-4" /></button>
                <span className="w-6 text-center text-lg font-bold" aria-live="polite">{seatCount}</span>
                <button type="button" aria-label="One seat more" onClick={() => setSeats(Math.min(maxSeats, seatCount + 1))} disabled={seatCount >= maxSeats}
                  className="flex h-11 w-11 items-center justify-center rounded-full border border-border disabled:opacity-40"><Plus className="h-4 w-4" /></button>
              </span>
            </div>
          </section>
        )}

        {canReserve && block && seatsAllowed === 0 && (
          <p className="rounded-2xl border border-border bg-card p-4 text-body text-text-primary">
            You have {drop.maxSeatsPerUser} seats on {dayLabel(block.date)}, the most for one day. Pick another day above to book more.
          </p>
        )}

        {canReserve && block && seatsAllowed > 0 && (
          <>
            {needsCode && (
              <label className="block">
                <span className="text-body font-semibold text-text-primary">Early access code</span>
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  autoCapitalize="characters"
                  autoComplete="off"
                  placeholder="Type the code"
                  className="mt-1.5 h-12 w-full rounded-xl border border-border bg-card px-3 text-base tracking-wider outline-none focus:border-primary"
                />
              </label>
            )}
            {isAuthenticated && drop.needsPhone && (
              <label className="block">
                <span className="text-body font-semibold text-text-primary">Your mobile number</span>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="10-digit number"
                  className="mt-1.5 h-12 w-full rounded-xl border border-border bg-card px-3 text-base outline-none focus:border-primary"
                />
                <span className="mt-1 block text-caption text-text-secondary">So the café can reach you about your seat.</span>
              </label>
            )}

            {/* Price, the way checkout shows it */}
            <div className="flex flex-col gap-1 rounded-2xl border border-border/80 bg-card p-3.5 text-caption text-text-secondary">
              <div className="flex items-center justify-between gap-3">
                <span className="min-w-0 truncate">
                  {flex && startTime ? `${clock(startTime)} – ${clock(endLabel)} · ${lengthText(hours)}` : block ? blockTimes(block) : ''} ·{' '}
                  {seatCount} {seatCount === 1 ? 'seat' : 'seats'}
                </span>
                <span className="flex-shrink-0 font-semibold text-text-primary">{rupees(total)}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>Seat deposit, taken off your bill</span>
                <span className="flex-shrink-0 font-semibold text-success">− {rupees(payNow)}</span>
              </div>
              <div className="mt-1 flex items-center justify-between gap-3 border-t border-border/70 pt-2">
                <span className="font-semibold text-text-primary">Left to pay at the café</span>
                <span className="font-heading text-body-emphasis font-bold text-text-primary">{rupees(Math.max(0, total - payNow))}</span>
              </div>
              <p className="pt-1">{rupees(payNow)} of your {rupees(total)} is paid now to lock the seat. We hold it for 10 minutes while you pay.</p>
            </div>

            {flex && (
              <p className="px-1 text-caption text-text-secondary">
                Arrive within 15 min of your start. The deposit isn’t refunded if you don’t show.{' '}
                <button type="button" onClick={() => setRulesOpen((o) => !o)} className="font-semibold text-primary underline-offset-2 hover:underline">
                  {rulesOpen ? 'Hide' : 'Details'}
                </button>
                {rulesOpen && (
                  <span className="mt-2 block rounded-xl border border-border bg-card p-3 text-body">
                    The deposit comes off your bill when you play and is not refunded. Arrive from 15 minutes before to 15 minutes after your start time.
                    After that the café can give your seat to someone waiting and you do not get the deposit back. If the café cancels, you get everything back.
                  </span>
                )}
              </p>
            )}
          </>
        )}
        {err}

        {drop.state === 'early' && <Waitlist drop={drop} onJoined={load} text="No code? Get a message when everyone can reserve." quiet />}

        {/* Share */}
        <section className="mt-2">
          <h2 className="font-heading text-h2 font-semibold text-text-primary">Tell your friends</h2>
          <p className="mt-1 text-body text-text-secondary">Seats are few. Send it to the people you want to play with.</p>
          <WhatsAppButton text={shareText} url={pageUrl} onShare={(c) => onShare(c, 'share_section')} className="mt-3" />
          <div className="mt-2">
            <ShareIconRow
              url={pageUrl}
              mapsUrl={drop.cafe.mapsUrl}
              calendar={firstBlock ? calendarFor(drop, firstBlock, pageUrl) : undefined}
              onShare={(c) => onShare(c, 'share_section')}
            />
          </div>
        </section>

        {/* Not ready yet: keep them close instead of letting them drift off */}
        {canReserve && paid.length === 0 && (
          <Waitlist drop={drop} onJoined={load} text="Not today? Get a nudge when seats open up." quiet />
        )}

        {/* Community: the page always ends on it */}
        <CommunityInviteCard where="drop_page" />
        <Link href="/community" className="rounded-2xl border border-border bg-card p-4 text-body text-text-secondary transition-colors hover:border-primary/40">
          <span className="block font-heading text-body-emphasis font-bold text-text-primary">Help build KHEL-O</span>
          Know a great café, or got game photos? Add them in a minute and get a shout-out.
          <span className="mt-1 block font-semibold text-primary">Contribute →</span>
        </Link>

        {/* Questions */}
        <section>
          <h2 className="font-heading text-h2 font-semibold text-text-primary">Questions</h2>
          <dl className="mt-2 flex flex-col divide-y divide-border rounded-2xl border border-border bg-card">
            <Faq
              q="What do I pay now?"
              a={flex
                ? `A reservation fee of ${rupees(drop.deposit)} a seat for up to 3 hours, or ${rupees(drop.depositLong)} for 4 or 5 hours. It is taken off your bill at the café.`
                : `${rupees(drop.deposit)} for each seat. It holds your seat. You pay the rest at the café on the day.`}
            />
            <Faq q="How do I get in?" a="After you pay, you get a QR pass here. Show it at the café." />
            <Faq q="Can I bring friends?" a={`Yes. You can reserve up to ${drop.maxSeatsPerUser} seats a day, on as many days as you like. Friends can also reserve their own.`} />
            <Faq q="Can I use a coupon?" a="No. Drop prices are fixed. Coupons and café offers don’t work on drops." />
            <Faq q="What if the café cancels?" a="You get your deposit back in full." />
            {flex && (
              <Faq
                q="What if I am late or cannot come?"
                a="Arrive between 15 minutes before and 15 minutes after your start time. After that the café can give your seat away and the reservation fee is not refunded."
              />
            )}
          </dl>
        </section>
      </div>

      {/* Pay bar: one big button, the seat count and what it costs, in plain words */}
      <div className="fixed bottom-0 left-0 right-0 z-overlay border-t border-border bg-card px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-2.5 shadow-overlay">
        <div className="mx-auto max-w-xl">
          {canReserve && block && seatsAllowed > 0 ? (
            <>
              <p className="mb-1.5 flex items-center justify-between gap-2 text-caption">
                <span className="min-w-0 truncate font-semibold text-text-primary">
                  {flex && startTime ? `${dayLabel(block.date)} · ${clock(startTime)} – ${clock(endLabel)}` : dayLabel(block.date)}
                </span>
                <span className={`flex-shrink-0 font-bold ${windowFree <= 2 ? 'text-error' : 'text-success'}`}>
                  {flex ? (windowFree <= 0 ? 'Full at this time' : windowFree <= 2 ? `Only ${windowFree} ${windowFree === 1 ? 'seat' : 'seats'} left` : `${windowFree} seats open`) : ''}
                </span>
              </p>
              <button
                type="button"
                onClick={reserve}
                disabled={busy}
                className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-[18px] font-extrabold text-white shadow-[0_6px_18px_-6px_var(--primary)] transition-transform active:scale-[0.98] hover:bg-primary-dark disabled:opacity-60"
              >
                {busy ? 'Opening payment…' : 'Reserve now'}
              </button>
              <p className="mt-1.5 text-center text-[11px] text-text-secondary">
                {rupees(payNow)} of your {rupees(total)} locks it · the rest at the café · no card needed to look
              </p>
            </>
          ) : canReserve && block && seatsAllowed === 0 ? (
            <button
              type="button"
              onClick={() => daysRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              className="flex h-14 w-full items-center justify-center rounded-2xl bg-primary text-[18px] font-extrabold text-white"
            >
              Reserve another day
            </button>
          ) : ended ? (
            <Link href={`/cafe/${drop.cafe.slug || drop.cafe.id}`} className="flex h-14 w-full items-center justify-center rounded-2xl bg-primary text-[17px] font-bold text-white">
              Book a slot at {drop.cafe.name}
            </Link>
          ) : (
            <WhatsAppButton text={shareText} url={pageUrl} label="Share with friends on WhatsApp" onShare={(c) => onShare(c, 'sticky')} />
          )}
        </div>
      </div>

      <CheckoutSignInSheet
        isOpen={signInOpen}
        onClose={() => setSignInOpen(false)}
        amountLabel={rupees(payNow)}
        summary={`${drop.title} · ${flex && startTime ? `${clock(startTime)} – ${clock(endLabel)}` : block ? blockTimes(block) : ''} · ${seatCount} ${seatCount === 1 ? 'seat' : 'seats'}`}
        onSignedIn={() => {
          reserveAfterSignIn.current = true;
          setSignInOpen(false);
        }}
        onUseEmail={() => router.push(`/login?redirect=${encodeURIComponent(back())}`)}
        onCreateAccount={() => router.push(`/register?redirect=${encodeURIComponent(back())}`)}
      />

      <MockPaymentModal
        isOpen={mockModalState?.isOpen || false}
        orderId={mockModalState?.orderId || ''}
        amount={mockModalState?.amount || 0}
        onSuccess={mockModalState?.onSuccess || (() => {})}
        onFailure={mockModalState?.onFailure || (() => {})}
        onClose={mockModalState?.onClose || (() => {})}
      />
    </CustomerShell>
  );
}

// 30-minute slots of a session, as minutes from midnight.
function hourRange(b: DropBlock): number[] {
  const out: number[] = [];
  for (let m = timeToMinutes(b.startTime); m < timeToMinutes(b.endTime); m += 30) out.push(m);
  return out;
}
function peakIn(b: DropBlock, from: number, to: number): number {
  return Math.max(0, ...hourRange(b).filter((m) => m >= from && m < to).map((m) => peakAt(b, m)));
}
function peakAt(b: DropBlock, m: number): number {
  return (b.bookedSlots ?? []).reduce((n, s) => (m < timeToMinutes(s.endTime) && m + 30 > timeToMinutes(s.startTime) ? n + s.seatsCount : n), 0);
}

function calendarFor(drop: Drop, b: DropBlock, url: string) {
  return {
    title: `${drop.title} at ${drop.cafe.name}`,
    start: blockStart(b),
    end: blockEnd(b),
    location: [drop.cafe.name, drop.cafe.address].filter(Boolean).join(', '),
    details: `Show your KHEL-O pass at the café. Map: ${drop.cafe.mapsUrl}`,
    url,
    fileName: `${drop.slug}.ics`,
  };
}

function Confirmation({
  drop,
  r,
  fresh,
  onShare,
  pageUrl,
}: {
  drop: Drop;
  r: DropReservation;
  fresh: boolean;
  onShare: (c: ShareChannel, where?: string) => void;
  pageUrl: string;
}) {
  const b = r.block;
  const story = b ? `/drops/${drop.slug}/story?block=${b.id}` : `/drops/${drop.slug}/story`;
  const when = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });
  return (
    <section className={`rounded-2xl border p-4 ${fresh ? 'border-success bg-success/10' : 'border-success/40 bg-success/5'}`}>
      <p className="flex items-center gap-2 text-lg font-bold text-success">
        <Check className="h-5 w-5" /> {r.status === 'checked_in' ? 'You’re checked in' : fresh ? 'Your seat is booked!' : 'Your seat is booked'}
      </p>
      {b && (
        <p className="mt-1 text-body text-text-primary">
          {dayLabel(b.date)} · {r.hours && r.startTime && r.endTime ? `${clock(r.startTime)} – ${clock(r.endTime)}` : blockTimes(b)} · {r.seats}{' '}
          {r.seats === 1 ? 'seat' : 'seats'}
        </p>
      )}
      {r.hours && r.arriveFrom && r.arriveUntil && r.status === 'confirmed' && (
        <p className="mt-2 rounded-xl bg-card px-3 py-2 text-body text-text-secondary">
          Be there between {when(r.arriveFrom)} and {when(r.arriveUntil)}. After that your seat can go to someone else.
        </p>
      )}
      {r.qr && (
        <div className="mt-4 flex flex-col items-center rounded-2xl border border-border bg-white p-4 text-[#111]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={r.qr} alt="Your check-in QR code" className="h-52 w-52" />
          <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-[#555]">Show this at the café</p>
          <p className="font-mono text-lg font-bold">{r.reference}</p>
        </div>
      )}
      <dl className="mt-4 space-y-1 text-body">
        <Row k={r.hours ? 'Reservation fee paid' : 'Paid now'} v={rupees(r.depositPaid)} />
        <Row k="Pay at the café" v={rupees(r.balanceDue)} strong />
      </dl>
      {r.passUrl && (
        <Link href={new URL(r.passUrl).pathname} className="mt-3 block text-center text-body font-semibold text-primary underline-offset-2 hover:underline">
          Open my pass on its own page
        </Link>
      )}

      {/* Right after paying: bring them into the community, then friends. */}
      <div className="mt-4 rounded-2xl border border-border bg-card p-3">
        <p className="font-heading text-body-emphasis font-bold text-text-primary">Support KHEL-O, join the community</p>
        <p className="mt-0.5 text-caption text-text-secondary">
          Every drop, challenge and café launch lands there first. A free tap is the best way to back us.
        </p>
        <CommunityButton where="drop_confirmation" className="mt-2" />
      </div>
      <div className="mt-3">
        <LastChallengeLink where="drop_confirmation_challenge" />
      </div>
      <div className="mt-3">
        <WhatsAppButton
          text={`I got my ${drop.game} seat at ${drop.cafe.name}! ${b ? `${dayLabel(b.date)}, ` : ''}come with me:`}
          url={pageUrl}
          label="Tell friends on WhatsApp"
          onShare={(c) => onShare(c, 'confirmation')}
        />
        <div className="mt-2">
          <ShareIconRow
            mapsUrl={drop.cafe.mapsUrl}
            calendar={b ? calendarFor(drop, b, pageUrl) : undefined}
            story={{ src: story, fileName: `${drop.slug}-story.png`, text: `I got my ${drop.game} seat at ${drop.cafe.name}` }}
            onShare={(c) => onShare(c, 'confirmation')}
          />
        </div>
      </div>
    </section>
  );
}

/** Every seat you already hold, one short row each. The QR lives on the pass page and in My Bookings. */
function MySeats({ drop, list }: { drop: Drop; list: DropReservation[] }) {
  return (
    <section className="rounded-2xl border border-success/40 bg-success/5 p-4">
      <p className="flex items-center gap-2 text-lg font-bold text-success">
        <Check className="h-5 w-5" /> You have {list.length} {list.length === 1 ? 'booking' : 'bookings'}
      </p>
      <ul className="mt-2 divide-y divide-border">
        {list.map((r) => {
          const b = r.block;
          return (
            <li key={r.id}>
              <Link href={new URL(r.passUrl || `${window.location.origin}/drops/${drop.slug}`).pathname} className="flex items-center justify-between gap-3 py-2.5">
                <span className="min-w-0">
                  <span className="block truncate font-semibold text-text-primary">
                    {b ? dayLabel(b.date) : drop.title} · {r.hours && r.startTime && r.endTime ? `${clock(r.startTime)} – ${clock(r.endTime)}` : b ? blockTimes(b) : ''}
                  </span>
                  <span className="block text-caption text-text-secondary">
                    {r.seats} {r.seats === 1 ? 'seat' : 'seats'} · {r.reference}
                  </span>
                </span>
                <span className="flex-shrink-0 text-body font-semibold text-primary">Show QR</span>
              </Link>
            </li>
          );
        })}
      </ul>
      <Link href="/bookings" className="mt-1 block text-center text-body font-semibold text-primary underline-offset-2 hover:underline">
        See all in My Bookings
      </Link>
    </section>
  );
}

function Countdown({ to }: { to: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const left = Math.max(0, Math.floor((new Date(to).getTime() - now) / 1000));
  return (
    <span className="font-mono text-error" aria-live="off">
      {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')} left
    </span>
  );
}

function Waitlist({ drop, onJoined, text, quiet = false }: { drop: Drop; onJoined: () => void; text: string; quiet?: boolean }) {
  const [phone, setPhone] = useState('');
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);
  const join = async () => {
    setState('busy');
    setError(null);
    try {
      await joinDropWaitlist(drop.slug, phone);
      trackAction('drop_waitlist_joined', { drop: drop.slug });
      setState('done');
      onJoined();
    } catch (e) {
      setError((e as Error)?.message || 'Please try again.');
      setState('idle');
    }
  };
  return (
    <section className={`rounded-2xl border px-4 py-3 ${quiet ? 'border-border bg-card' : 'border-secondary/40 bg-secondary/10'}`}>
      <p className="flex items-center gap-2 font-semibold text-text-primary">
        <Bell className="h-4 w-4 text-secondary" /> {text}
      </p>
      {drop.waitlistCount > 0 && <p className="mt-1 text-body text-text-secondary">{drop.waitlistCount} people are waiting.</p>}
      {state === 'done' ? (
        <p className="mt-2 text-body font-semibold text-success">Done. We’ll send you a message when it opens.</p>
      ) : (
        <div className="mt-2 flex gap-2">
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            inputMode="tel"
            autoComplete="tel"
            placeholder="Your mobile number"
            aria-label="Your mobile number"
            className="h-12 min-w-0 flex-1 rounded-xl border border-border bg-card px-3 text-base outline-none focus:border-primary"
          />
          <button
            type="button"
            onClick={join}
            disabled={state === 'busy' || phone.replace(/\D/g, '').length < 10}
            className="h-12 rounded-xl bg-primary px-4 font-bold text-white disabled:opacity-50"
          >
            Notify me
          </button>
        </div>
      )}
      {error && <p className="mt-2 text-body text-error">{error}</p>}
    </section>
  );
}

function Row({ k, v, strong = false }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-text-secondary">{k}</dt>
      <dd className={strong ? 'font-bold text-text-primary' : 'text-text-primary'}>{v}</dd>
    </div>
  );
}

function Faq({ q, a }: { q: string; a: string }) {
  return (
    <div className="px-4 py-3">
      <dt className="font-semibold text-text-primary">{q}</dt>
      <dd className="mt-1 text-body text-text-secondary">{a}</dd>
    </div>
  );
}
