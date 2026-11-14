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
  listDrops,
  reserveDrop,
  verifyDropPayment,
  type Drop,
  type DropBlock,
  type DropReservation,
} from '@/lib/api/drops';
import { atMinutes, blockEnd, blockStart, blockTimes, calDate, clock, clockRange, dayLabel, dropLengths, dropSeatPrice, gameKey, minHoursAt, priceSplit, rupees, whenText, wireTime } from '@/lib/drops';
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

  const [raw, setDrop] = useState<Drop | null>(initial);
  // A drop with PS5s and Xboxes: the player picks which kind, and sees only that kind's free time.
  const [setupPick, setSetupPick] = useState<string>(params.get('setup') ?? '');
  const setups = raw?.setups ?? [];
  const multi = setups.length > 1;
  const setup = multi ? (setups.find((s) => s.tierId === setupPick) ?? setups[0]).tierId : null;
  const drop = useMemo(() => {
    if (!raw || !setup) return raw;
    return {
      ...raw,
      blocks: raw.blocks.map((b) => {
        const v = b.bySetup?.[setup];
        if (!v) return b;
        const left = Object.values(v.hourFree).length ? Math.max(0, ...Object.values(v.hourFree)) : b.seatsLeft;
        return { ...b, seatsTotal: v.seatsTotal, hourFree: v.hourFree, bookedSlots: v.bookedSlots, seatsLeft: left };
      }),
    };
  }, [raw, setup]);
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
  const [otherCafes, setOtherCafes] = useState(0);
  const viewed = useRef(false);
  const daysRef = useRef<HTMLElement | null>(null);
  const scrolled = useRef(false);
  const pickedByHand = useRef(Boolean(params.get('block')));

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

  // The same game at other cafés: offer the pick-your-café screen so nobody books the far one by mistake.
  const dropGame = drop?.game;
  const dropId = drop?.id;
  useEffect(() => {
    if (!dropGame || !dropId) return;
    let live = true;
    listDrops()
      .then((all) => live && setOtherCafes(all.filter((d) => d.id !== dropId && gameKey(d.game) === gameKey(dropGame)).length))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [dropGame, dropId]);

  // Opening a live drop lands on the day and time picker, where the booking happens.
  useEffect(() => {
    if (scrolled.current || !drop || !(drop.state === 'open' || drop.state === 'early')) return;
    if (window.location.hash || drop.myReservations.length > 0) return;
    scrolled.current = true;
    const t = setTimeout(() => daysRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 600);
    return () => clearTimeout(t);
  }, [drop]);

  const flex = !!drop?.maxHours;
  const lengths = drop ? dropLengths(drop) : [];
  // The everyday hours, and any one-off session (a launch night) told apart.
  const usual = (() => {
    if (!drop?.blocks.length) return null;
    const key = (b: DropBlock) => `${b.startTime}-${b.endTime}`;
    const n = new Map<string, number>();
    drop.blocks.forEach((b) => n.set(key(b), (n.get(key(b)) ?? 0) + 1));
    return [...drop.blocks].sort((a, b) => (n.get(key(b)) ?? 0) - (n.get(key(a)) ?? 0))[0];
  })();
  const extras = usual && drop ? drop.blocks.filter((b) => b.startTime !== usual.startTime || b.endTime !== usual.endTime) : [];
  const block = drop?.blocks.find((b) => b.id === blockId) ?? null;
  const booked = useMemo(() => block?.bookedSlots ?? [], [block]);
  // Online booking may be open only a set time ahead (48 hours): later starts are "not open yet".
  const limitMs = drop?.bookableUntil ? Date.parse(drop.bookableUntil) : null;
  const beyond = (b: DropBlock) => limitMs != null && atMinutes(b.date, timeToMinutes(b.startTime)).getTime() > limitMs;
  const limitMin = (b: DropBlock) => (limitMs == null ? null : Math.floor((limitMs - atMinutes(b.date, 0).getTime()) / 60000));
  const anyBeyond = Boolean(drop && limitMs != null && (drop.blocks.some(beyond) || (drop.endsOn && atMinutes(drop.endsOn, 0).getTime() > limitMs)));
  // This date's own price windows, and the shortest booking the window you start in allows.
  const bands = block?.timePrices ?? drop?.timePrices ?? [];
  const priced = drop ? { ...drop, timePrices: bands } : null;
  const minH = block && startTime ? minHoursAt(bands, inBlock(startTime, block)) : 1;
  // The cap is per day: seats on one night never stop you booking another night.
  const seatsHeld = (drop?.myReservations ?? [])
    .filter((r) => r.blockId === block?.id)
    .filter((r) => r.status === 'confirmed' || r.status === 'checked_in' || r.status === 'pending_payment')
    .reduce((n, r) => n + r.seats, 0);
  const seatsAllowed = drop ? Math.max(0, drop.maxSeatsPerUser - seatsHeld) : 0;
  const heldOn = (id: string) =>
    (drop?.myReservations ?? [])
      .filter((r) => r.blockId === id && (r.status === 'confirmed' || r.status === 'checked_in' || r.status === 'pending_payment'))
      .reduce((n, r) => n + r.seats, 0);

  // Flexible: free seats for the exact window picked, counted the same way the booking slider does.
  const windowFree = useMemo(() => {
    if (!block || !startTime) return 0;
    const s = inBlock(startTime, block);
    return calculateWindowRemainingSeats(block.seatsTotal, booked, s, s + Math.round(hours * 60));
  }, [block, booked, startTime, hours]);
  const sessionLeft = (b: DropBlock) =>
    flex && b.bookedSlots ? Math.max(0, ...hourRange(b).map((m) => b.seatsTotal - peakAt(b, m))) : b.seatsLeft;
  const maxSeats = Math.max(1, Math.min(seatsAllowed, flex ? windowFree : block?.seatsLeft ?? 1));
  const seatCount = Math.min(seats, maxSeats);

  const feePerSeat = !drop ? 0 : flex ? (hours <= 3 ? drop.deposit : drop.depositLong) : drop.deposit;
  const priceAt = (h: number) => (priced && block && startTime ? dropSeatPrice(priced, inBlock(startTime, block), h) : 0);
  const split = priced && block && startTime && flex ? priceSplit(priced, inBlock(startTime, block), hours) : [];
  const totalPerSeat = !drop || !block ? 0 : flex ? priceAt(hours) : block.pricePerSeat;
  const payNow = feePerSeat * seatCount;
  const total = totalPerSeat * seatCount;

  const pick = (b: DropBlock) => {
    if (b.started || sessionLeft(b) === 0 || beyond(b)) return;
    setBlockId(b.id);
    setError(null);
    // Pre-pick the best open slot so one tap reserves: an evening 2-hour slot if there is one.
    const lim = limitMin(b);
    const own = b.timePrices ?? drop?.timePrices ?? [];
    const ok = (m: number, len: number) =>
      m + len <= timeToMinutes(b.endTime) && b.seatsTotal - peakIn(b, m, m + len) >= 1 && atMinutes(b.date, m).getTime() > Date.now() &&
      (lim == null || m <= lim) && len >= minHoursAt(own, m) * 60;
    const slots = b.bookedSlots ? hourRange(b) : [];
    // A café selling packages (1, 3, 5 hours) starts on its shortest one of 2 hours or more.
    const lens = drop ? dropLengths(drop) : [1, 2];
    const want = lens.find((h) => h >= 2) ?? lens[0] ?? 1;
    const short = lens[0] ?? 1;
    const evening = slots.find((m) => m >= 18 * 60 && ok(m, want * 60));
    const anyWant = slots.find((m) => ok(m, want * 60));
    const anyShort = slots.find((m) => ok(m, short * 60));
    if (flex) {
      const m = evening ?? anyWant ?? anyShort;
      setStartTime(m != null ? hhmm(m) : b.startTime);
      setHours(evening != null || anyWant != null ? want : short);
    }
    track('drop_block_selected', { block: b.id, date: b.date });
  };

  // Moving the start into a window with a longer shortest booking stretches the length to it.
  useEffect(() => {
    if (!flex || !drop || hours >= minH) return;
    const ok = dropLengths(drop).find((h) => h >= minH);
    if (ok) setHours(ok);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minH, startTime]);

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
    // Skip days where they already hold the most seats allowed, so the page never opens on a dead end.
    const free = (x: DropBlock) => !x.started && sessionLeft(x) > 0 && !beyond(x);
    const b = drop.blocks.find((x) => free(x) && heldOn(x.id) < drop.maxSeatsPerUser) ?? drop.blocks.find(free);
    if (b && drop.maxHours) pick(b);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drop?.id]);

  // Their own seats arrive a moment after the page (the first paint is signed out). If the day
  // we opened on turns out to be one they have maxed, move to the next day they can book.
  const heldCount = drop?.myReservations.length ?? 0;
  useEffect(() => {
    if (!drop || !drop.maxHours || pickedByHand.current || !blockId) return;
    if (heldOn(blockId) < drop.maxSeatsPerUser) return;
    const next = drop.blocks.find((x) => !x.started && sessionLeft(x) > 0 && !beyond(x) && heldOn(x.id) < drop.maxSeatsPerUser);
    if (next) pick(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heldCount]);

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
  const endLabel = startTime && block ? hhmm(inBlock(startTime, block) + Math.round(hours * 60)) : '';

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
        startTime: flex && startTime ? wireTime(startTime) : undefined,
        hours: flex ? hours : undefined,
        phone: drop.needsPhone ? phone : undefined,
        setup: setup ?? undefined,
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
      <div className="mx-auto flex max-w-xl flex-col gap-4 pb-28 lg:grid lg:max-w-5xl lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-start lg:gap-x-10">
        {/* Banner */}
        <section className="lg:sticky lg:top-20">
          <div className="overflow-hidden rounded-2xl border border-border/70 shadow-card">
            {art ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={art} alt={`${drop.game} artwork`} className="aspect-[2.3/1] w-full object-cover sm:aspect-video" />
            ) : (
              <div className="aspect-[2.3/1] w-full bg-gradient-to-br sm:aspect-video from-primary/80 to-secondary/70" aria-hidden />
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
          {otherCafes > 0 && (
            <Link
              href={`/drops?game=${gameKey(drop.game)}`}
              onClick={() => track('drop_other_cafes_tap', { others: otherCafes })}
              className="mt-2 inline-flex min-h-[44px] items-center text-body font-semibold text-primary underline-offset-2 hover:underline"
            >
              Not near you? {otherCafes} more {otherCafes === 1 ? 'café has' : 'cafés have'} {drop.game} →
            </Link>
          )}
          {drop.tagline && <p className="mt-1 text-body text-text-secondary">{drop.tagline}</p>}
          <div className="mt-3 flex flex-wrap gap-2 text-caption font-semibold text-text-primary">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5">
              <Ticket className="h-3.5 w-3.5 text-primary" /> {drop.seatsPerSlot ? `${drop.seatsPerSlot} ${drop.seatsPerSlot === 1 ? 'seat' : 'seats'} at a time, every night` : `${drop.seatsLeft} of ${drop.seatsTotal} seats left`}
            </span>
            {(multi || drop.playsOn) && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-3 py-1.5 text-primary">
                Play on {multi ? setups.map((s) => s.name).join(' or ') : drop.playsOn}
              </span>
            )}
            {drop.lengthPrices?.length ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 tabular-nums">
                {drop.lengthPrices.map((p) => `${p.hours} hr ${rupees(p.price)}`).join(' · ')}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5">
                {rupees(drop.pricePerHour)} an hour
              </span>
            )}
            {(drop.timePrices ?? []).map((t) => (
              <span key={t.start} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 tabular-nums">
                {clockRange(t.start, t.end)}: {rupees(t.perHour)} an hour
              </span>
            ))}
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

        <div className="flex min-w-0 flex-col gap-4">
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
            <p className="mt-1 text-body text-text-secondary">Pay the {rupees(pending.deposit)} booking fee to keep them. If you don’t, they go back to everyone.</p>
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

        {/* Day */}
        {!ended && (
        <section ref={daysRef} className="scroll-mt-20">
          {multi && (
            <div className="mb-4">
              <h2 className="font-heading text-h2 font-semibold text-text-primary">Pick your console</h2>
              <div className="mt-2 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Console">
                {setups.map((s) => {
                  const on = s.tierId === setup;
                  return (
                    <button
                      key={s.tierId}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => {
                        setSetupPick(s.tierId);
                        track('drop_setup_selected', { setup: s.name });
                      }}
                      className={`flex min-h-[56px] flex-col items-start justify-center rounded-xl border px-3 text-left transition-colors ${
                        on ? 'border-primary bg-primary/10' : 'border-border bg-card hover:border-primary/50'
                      }`}
                    >
                      <span className="font-heading text-body-emphasis font-bold text-text-primary">{s.name}</span>
                      <span className="text-caption text-text-secondary">
                        {s.count} {s.count === 1 ? 'console' : 'consoles'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <h2 className="font-heading text-h2 font-semibold text-text-primary">{canReserve ? 'Pick a day' : 'Days'}</h2>
          {flex && usual && (
            <p className="text-caption text-text-secondary">
              {usual.hours >= 24
                ? 'Open all 24 hours, every day. Book any time, day or night.'
                : `Open ${clock(usual.startTime)} – ${clock(usual.endTime)}${timeToMinutes(usual.endTime) > 1440 ? ' (next morning)' : ''}, every day.`}
              {extras.map((b) => ` Also ${clock(b.startTime)} – ${clock(b.endTime)} on ${dayLabel(calDate(b.date, b.startTime))}.`).join('')}
            </p>
          )}
          <div className="-mx-4 mt-2 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]" role="radiogroup" aria-label="Days">
            {drop.blocks.map((b) => {
              const later = beyond(b);
              const gone = b.started || sessionLeft(b) === 0 || later;
              const on = b.id === blockId;
              const shownDate = calDate(b.date, b.startTime); // the launch night opens at 12 AM on launch day
              // Two sessions on one date (a launch night 12 AM - 6 AM, then the day): name them by start time.
              const twin = drop.blocks.some((x) => x.id !== b.id && calDate(x.date, x.startTime) === shownDate);
              return (
                <button
                  key={b.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  disabled={!canReserve || gone}
                  onClick={() => {
                    pickedByHand.current = true;
                    pick(b);
                  }}
                  className={`min-h-[56px] w-[64px] flex-none rounded-xl border px-1 py-1.5 text-center transition-colors ${
                    on ? 'border-primary bg-primary/10' : 'border-border bg-card'
                  } ${gone ? 'opacity-50' : canReserve ? 'hover:border-primary/50' : ''}`}
                >
                  <span className="block text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
                    {new Date(`${shownDate}T12:00:00+05:30`).toLocaleDateString('en-IN', { weekday: 'short', timeZone: 'Asia/Kolkata' })}
                  </span>
                  <span className="block font-heading text-body-emphasis font-bold leading-tight text-text-primary">
                    {new Date(`${shownDate}T12:00:00+05:30`).toLocaleDateString('en-IN', { day: 'numeric', timeZone: 'Asia/Kolkata' })}
                  </span>
                  <span className={`block text-[11px] ${gone ? 'text-error' : 'text-text-secondary'}`}>
                    {b.started ? 'Started' : later ? 'Soon' : sessionLeft(b) === 0 ? 'Full' : flex ? (twin || shownDate !== b.date ? clock(b.startTime) : new Date(`${b.date}T12:00:00+05:30`).toLocaleDateString('en-IN', { month: 'short', timeZone: 'Asia/Kolkata' })) : `${clock(b.startTime)}`}
                  </span>
                </button>
              );
            })}
          </div>
          {anyBeyond && canReserve && drop.advanceHours ? (
            <div className="mt-3 rounded-xl border border-border bg-card px-3 py-2.5">
              <p className="font-semibold text-text-primary">Planning ahead?</p>
              <p className="text-caption text-text-secondary">
                Online reservations are currently available for the next {drop.advanceHours} hours. For bookings beyond this period, contact our team.
              </p>
              <Link href="/support" className="mt-1 inline-flex min-h-[44px] items-center font-semibold text-primary underline">
                Contact KHEL-O
              </Link>
            </div>
          ) : null}
        </section>
        )}

        {/* Packages: the café's set lengths and prices, one tap each */}
        {canReserve && block && flex && startTime && !!drop.lengthPrices?.length && (
          <section aria-label="How long">
            <h2 className="font-heading text-h2 font-semibold text-text-primary">How long?</h2>
            <div className="mt-2 grid grid-cols-3 gap-2" role="radiogroup" aria-label="Packages">
              {lengths.map((h) => {
                const on = h === hours;
                const fits = inBlock(startTime, block) + h * 60 <= timeToMinutes(block.endTime);
                const tooShort = h < minH;
                return (
                  <button
                    key={h}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    disabled={tooShort}
                    title={tooShort ? `From ${clock(startTime)} the shortest booking is ${minH} hours` : undefined}
                    onClick={() => {
                      // Keep the start when it fits, else slide back so the package ends with the session.
                      if (!fits) setStartTime(hhmm(Math.max(timeToMinutes(block.startTime), timeToMinutes(block.endTime) - h * 60)));
                      setHours(h);
                      setError(null);
                    }}
                    className={`flex min-h-[64px] flex-col items-center justify-center rounded-xl border px-2 py-2 transition-colors disabled:opacity-40 ${
                      on ? 'border-primary bg-primary/10' : 'border-border bg-card hover:border-primary/50'
                    }`}
                  >
                    <span className="font-heading text-body-emphasis font-bold text-text-primary">{h} {h === 1 ? 'hour' : 'hours'}</span>
                    <span className={`text-caption font-semibold tabular-nums ${on ? 'text-primary' : 'text-text-secondary'}`}>{rupees(priceAt(h))}</span>
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
              setStartTime(hhmm(inBlock(s.slice(0, 5), block)));
              setHours(h);
              setError(null);
            }}
            bookedSlots={booked}
            totalSeats={block.seatsTotal}
            requestedSeats={seatCount}
            remainingSeats={windowFree}
            skipCoachmark={false}
            minDurationMinutes={minH * 60}
            maxDurationMinutes={(lengths[lengths.length - 1] ?? drop.maxHours ?? 5) * 60}
            onlyDurationsMinutes={lengths.map((h) => h * 60)}
            stepMinutes={30}
            priceBands={bands}
            bookableUntilMin={limitMin(block)}
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
        {canReserve && block && flex && startTime && (split.length > 1 || minH > 1) && (
          <p className="-mt-2 text-caption text-text-secondary tabular-nums">
            {split.length > 1 && (
              <>
                {split.map((x) => `${clockRange(hhmm(x.from), hhmm(x.to))} ${rupees(x.amount)}`).join(' + ')}
                {drop.lengthPrices?.length ? '' : ` = ${rupees(priceAt(hours))}`}
              </>
            )}
            {split.length > 1 && minH > 1 ? ' · ' : ''}
            {minH > 1 ? `From ${clock(startTime)} the shortest booking is ${minH} hours.` : ''}
          </p>
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
                <span>Booking fee, paid now</span>
                <span className="flex-shrink-0 font-semibold text-success">− {rupees(payNow)}</span>
              </div>
              <div className="mt-1 flex items-center justify-between gap-3 border-t border-border/70 pt-2">
                <span className="font-semibold text-text-primary">Left to pay at the café</span>
                <span className="font-heading text-body-emphasis font-bold text-text-primary">{rupees(Math.max(0, total - payNow))}</span>
              </div>
            </div>

            {flex && (
              <p className="px-1 text-caption text-text-secondary">
                Arrive within 15 min of your start. The booking fee isn’t refunded if you don’t show.{' '}
                <button type="button" onClick={() => setRulesOpen((o) => !o)} className="font-semibold text-primary underline-offset-2 hover:underline">
                  {rulesOpen ? 'Hide' : 'Details'}
                </button>
                {rulesOpen && (
                  <span className="mt-2 block rounded-xl border border-border bg-card p-3 text-body">
                    The booking fee comes off your bill when you play and is not refunded. Arrive from 15 minutes before to 15 minutes after your start time.
                    After that the café can give your seat to someone waiting and you do not get the booking fee back. If the café cancels, you get everything back.
                  </span>
                )}
              </p>
            )}
          </>
        )}
        {err}

        {drop.state === 'early' && <Waitlist drop={drop} onJoined={load} text="No code? Get a message when everyone can reserve." quiet />}

        {/* Share */}
        <section className="mt-1">
          <h2 className="font-heading text-body-emphasis font-bold text-text-primary">Tell your friends</h2>
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

        {/* Questions */}
        <details className="group rounded-2xl border border-border bg-card px-4">
          <summary className="flex min-h-[48px] cursor-pointer list-none items-center justify-between font-heading text-body-emphasis font-bold text-text-primary">
            Questions <span className="text-text-secondary transition-transform group-open:rotate-180" aria-hidden>⌄</span>
          </summary>
          <dl className="flex flex-col divide-y divide-border rounded-2xl border border-border bg-card">
            <Faq
              q="What do I pay now?"
              a={flex
                ? `A booking fee of ${rupees(drop.deposit)} a seat for up to 3 hours, or ${rupees(drop.depositLong)} for 4 or 5 hours. It is taken off your bill at the café.`
                : `A booking fee of ${rupees(drop.deposit)} for each seat. It holds your seat and comes off your bill. You pay the rest at the café on the day.`}
            />
            <Faq q="How do I get in?" a="After you pay, you get a QR pass here. Show it at the café." />
            <Faq q="Can I bring friends?" a={`Yes. You can reserve up to ${drop.maxSeatsPerUser} seats a day, on as many days as you like. Friends can also reserve their own.`} />
            <Faq q="Can I use a coupon?" a="No. Drop prices are fixed. Coupons and café offers don’t work on drops." />
            <Faq q="What if the café cancels?" a="You get your booking fee back in full." />
            {flex && (
              <Faq
                q="What if I am late or cannot come?"
                a="Arrive between 15 minutes before and 15 minutes after your start time. After that the café can give your seat away and the booking fee is not refunded."
              />
            )}
          </dl>
        </details>
        </div>
      </div>

      {/* Pay bar: one big button, the seat count and what it costs, in plain words */}
      <div className="fixed bottom-0 left-0 right-0 z-overlay border-t border-border bg-card px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-2.5 shadow-overlay">
        <div className="mx-auto max-w-xl">
          {canReserve && block && seatsAllowed > 0 ? (
            <>
              <p className="mb-1.5 flex items-center justify-between gap-2 text-caption">
                <span className="min-w-0 truncate font-semibold text-text-primary">
                  {flex && startTime ? `${dayLabel(calDate(block.date, startTime))} · ${clock(startTime)} – ${clock(endLabel)}` : dayLabel(block.date)}
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
                Pay {rupees(payNow)} now · {rupees(Math.max(0, total - payNow))} at the café
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

// A clock time inside a session, as minutes from the session day's midnight: 02:00 in a
// 6 PM to 4 AM session is 26:00 (1560). Times already in that form pass through.
function inBlock(t: string, b: DropBlock): number {
  const m = timeToMinutes(t);
  return m < timeToMinutes(b.startTime) ? m + 1440 : m;
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
        <Row k="Booking fee paid" v={rupees(r.depositPaid)} />
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
