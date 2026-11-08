'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Bell, Check, Clock, KeyRound, Minus, Plus, Ticket } from 'lucide-react';
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
import { CommunityButton, CommunityInviteCard } from '@/components/customer/CommunityInvite';
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
  const [agreed, setAgreed] = useState(false);
  const [code, setCode] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justPaid, setJustPaid] = useState<string | null>(null);
  const [signInOpen, setSignInOpen] = useState(false);
  const reserveAfterSignIn = useRef(false);
  const reserveRef = useRef<() => void>(() => {});
  const viewed = useRef(false);

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

  const flex = !!drop?.maxHours;
  const block = drop?.blocks.find((b) => b.id === blockId) ?? null;
  const booked = useMemo(() => block?.bookedSlots ?? [], [block]);
  const seatsHeld = (drop?.myReservations ?? [])
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
    // First start that still has a seat for one hour.
    const first = b.bookedSlots
      ? hourRange(b).find((m) => m + 60 <= timeToMinutes(b.endTime) && b.seatsTotal - peakIn(b, m, m + 60) >= 1 && new Date(`${b.date}T${hhmm(m)}:00+05:30`).getTime() > Date.now())
      : undefined;
    if (flex) {
      setStartTime(first != null ? hhmm(first) : b.startTime);
      setHours(1);
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
  const shareText = `${drop.title} at ${drop.cafe.name}. ${drop.seatsLeft} seats left. Reserve yours:`;
  const canReserve = drop.state === 'open' || drop.state === 'early';
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
    if (flex && !agreed) {
      setError('Please tick the box to say you have read the rules.');
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
          <p className="mt-3 text-caption font-bold uppercase tracking-wider text-primary">Launch drop · {drop.cafe.name}</p>
          <h1 className="font-heading text-h1 font-bold text-text-primary">{drop.title}</h1>
          {drop.tagline && <p className="mt-1 text-body text-text-secondary">{drop.tagline}</p>}
          <div className="mt-3 flex flex-wrap gap-2 text-caption font-semibold text-text-primary">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5">
              <Ticket className="h-3.5 w-3.5 text-primary" /> {drop.seatsLeft} of {drop.seatsTotal} seats left
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5">
              {rupees(drop.pricePerHour)} an hour
            </span>
          </div>
          {art === GTA_ART && <p className="mt-2 text-[11px] text-text-secondary">Grand Theft Auto VI artwork © Rockstar Games.</p>}
        </section>

        {/* Your seats */}
        {paid.map((r) => (
          <Confirmation key={r.id} drop={drop} r={r} fresh={r.id === justPaid} onShare={onShare} pageUrl={pageUrl} />
        ))}
        {pending && !busy && (
          <div className="rounded-2xl border border-warning/40 bg-warning/10 p-4">
            <p className="font-semibold text-text-primary">
              {pending.seats} {pending.seats === 1 ? 'seat' : 'seats'} on hold until{' '}
              {new Date(pending.expiresAt!).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' })}
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
        {drop.state === 'cancelled' && (
          <p className="rounded-2xl border border-error/30 bg-error/10 px-4 py-3 text-body text-text-primary">
            This drop was cancelled. Anyone who paid gets their money back.
          </p>
        )}

        {/* Day */}
        <section>
          <h2 className="font-heading text-h2 font-semibold text-text-primary">{canReserve ? 'Pick a day' : 'Days'}</h2>
          <div className="mt-2 flex gap-2 overflow-x-auto pb-1 scrollbar-hide" role="radiogroup" aria-label="Days">
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
                  className={`min-h-[64px] min-w-[104px] flex-none rounded-xl border px-3 py-2 text-left transition-colors ${
                    on ? 'border-primary bg-primary/10' : 'border-border bg-card'
                  } ${gone ? 'opacity-50' : canReserve ? 'hover:border-primary/50' : ''}`}
                >
                  <span className="block text-body font-bold text-text-primary">{dayLabel(b.date)}</span>
                  <span className="block text-caption text-text-secondary">
                    {b.started ? 'Started' : sessionLeft(b) === 0 ? 'Sold out' : `${clock(b.startTime)} – ${clock(b.endTime)}`}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

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
            skipCoachmark
            minDurationMinutes={60}
            maxDurationMinutes={(drop.maxHours ?? 5) * 60}
            stepMinutes={30}
          >
            <div className="flex items-center justify-between gap-3 py-1.5">
              <div className="min-w-0">
                <span className="font-heading text-body font-bold text-text-primary">How many seats?</span>
                <p className="truncate text-caption text-text-secondary">Up to {drop.maxSeatsPerUser} · {windowFree} free at this time</p>
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
            You already have {drop.maxSeatsPerUser} seats for this drop. That’s the most one person can reserve.
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
                <span>Reservation fee, paid now (taken off the bill)</span>
                <span className="flex-shrink-0 font-semibold text-text-primary">{rupees(payNow)}</span>
              </div>
              <div className="mt-1 flex items-center justify-between gap-3 border-t border-border/70 pt-2">
                <span className="font-semibold text-text-primary">Pay at the café</span>
                <span className="font-heading text-body-emphasis font-bold text-text-primary">{rupees(Math.max(0, total - payNow))}</span>
              </div>
              <p className="pt-1">We hold your seats for 10 minutes while you pay. No coupons on drops.</p>
            </div>

            {flex && (
              <label className="flex items-start gap-3 rounded-2xl border border-border bg-card p-3.5 text-body text-text-secondary">
                <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5 h-5 w-5 flex-none accent-[var(--primary)]" />
                <span>
                  <span className="font-semibold text-text-primary">The rules, in plain words.</span> The reservation fee is <b>not refunded</b> and
                  comes off your bill when you play. Arrive between <b>15 minutes before and 15 minutes after</b> your start time. After that the
                  café can give your seat to someone waiting and you do not get the fee back. If the café cancels, you get everything back.
                </span>
              </label>
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

        {/* Community: the page always ends on it */}
        <CommunityInviteCard where="drop_page" />

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
            <Faq q="Can I bring friends?" a={`Yes. You can reserve up to ${drop.maxSeatsPerUser} seats. Friends can also reserve their own.`} />
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

      {/* Pay bar, like checkout's */}
      <div className="fixed bottom-0 left-0 right-0 z-overlay border-t border-border bg-card px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 shadow-overlay">
        <div className="mx-auto max-w-xl">
          {canReserve && block && seatsAllowed > 0 ? (
            <button
              type="button"
              onClick={reserve}
              disabled={busy}
              className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-[17px] font-bold text-white transition-colors hover:bg-primary-dark disabled:opacity-60"
            >
              {busy
                ? 'Opening payment…'
                : isAuthenticated || !isHydrated
                ? `Pay ${rupees(payNow)} to hold ${seatCount === 1 ? 'your seat' : `${seatCount} seats`}`
                : `Sign in to pay ${rupees(payNow)}`}
            </button>
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
