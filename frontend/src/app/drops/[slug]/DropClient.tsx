'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Bell, Check, ChevronRight, Clock, KeyRound, MapPin, Minus, Plus, Ticket } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { useRazorpay } from '@/hooks/useRazorpay';
import { MockPaymentModal } from '@/components/MockPaymentModal';
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
import { blockEnd, blockStart, blockTimes, dayLabel, rupees, whenText } from '@/lib/drops';
import { ShareIconRow, WhatsAppButton, type ShareChannel } from '@/components/shared/ShareActions';

const REFRESH_MS = 20_000;
const codeKey = (slug: string) => `khelo_drop_code_${slug}`;

export function DropClient({ slug, initial }: { slug: string; initial: Drop | null }) {
  const router = useRouter();
  const params = useSearchParams();
  const { isAuthenticated, isHydrated, user } = useAuthStore();
  const { displayRazorpay, mockModalState } = useRazorpay();

  const [drop, setDrop] = useState<Drop | null>(initial);
  const [missing, setMissing] = useState(false);
  const [blockId, setBlockId] = useState<string | null>(params.get('block'));
  const [seats, setSeats] = useState(Math.max(1, Number(params.get('seats')) || 1));
  const [code, setCode] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justPaid, setJustPaid] = useState<string | null>(null);
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

  if (!drop) {
    return (
      <Shell>
        <p className="mt-16 text-center text-[#A3A6B1]">{missing ? 'We couldn’t find this drop.' : 'Loading…'}</p>
        {missing && (
          <Link href="/" className="mt-4 block text-center font-semibold text-[#E8675D]">
            Go to KHEL-O
          </Link>
        )}
      </Shell>
    );
  }

  const pageUrl = typeof window !== 'undefined' ? `${window.location.origin}/drops/${drop.slug}` : `https://khel-o.com/drops/${drop.slug}`;
  const shareText = `${drop.title} at ${drop.cafe.name}. ${drop.seatsLeft} seats left. Reserve yours:`;
  const canReserve = drop.state === 'open' || drop.state === 'early';
  const needsCode = drop.state === 'early' && drop.hasEarlyAccessCode;
  const paid = drop.myReservations.filter((r) => r.status === 'confirmed' || r.status === 'checked_in');
  const pending = drop.myReservations.find((r) => r.status === 'pending_payment' && r.expiresAt && new Date(r.expiresAt) > new Date());
  const seatsHeld = drop.myReservations
    .filter((r) => r.status === 'confirmed' || r.status === 'checked_in' || r.status === 'pending_payment')
    .reduce((n, r) => n + r.seats, 0);
  const seatsAllowed = Math.max(0, drop.maxSeatsPerUser - seatsHeld);
  const block = drop.blocks.find((b) => b.id === blockId) ?? null;
  const maxSeats = Math.max(1, Math.min(seatsAllowed, block?.seatsLeft ?? drop.maxSeatsPerUser));
  const seatCount = Math.min(seats, maxSeats);
  const firstBlock = paid[0]?.block ?? block ?? drop.blocks.find((b) => !b.started) ?? drop.blocks[0];

  const pick = (b: DropBlock) => {
    if (b.started || b.seatsLeft === 0) return;
    setBlockId(b.id);
    setError(null);
    track('drop_block_selected', { block: b.id, date: b.date });
  };

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

  const reserve = async () => {
    if (!block) return;
    if (!isAuthenticated) {
      const back = `/drops/${drop.slug}?block=${block.id}&seats=${seatCount}`;
      router.push(`/login?redirect=${encodeURIComponent(back)}`);
      return;
    }
    if (needsCode && !code.trim()) {
      setError('Type the early access code first.');
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
        phone: drop.needsPhone ? phone : undefined,
      });
      pay(done.reservation, done.order);
    } catch (e) {
      setError((e as Error)?.message || 'Something went wrong. Please try again.');
      setBusy(false);
      load();
    }
  };

  return (
    <Shell>
      {/* Banner */}
      <section className="relative overflow-hidden rounded-3xl border border-white/10">
        {drop.coverImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={drop.coverImageUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-60" />
        ) : (
          <div className="absolute inset-0 bg-[linear-gradient(160deg,#2B1240_0%,#7A2A4A_45%,#E8774A_80%,#F6C25B_100%)]" aria-hidden />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0A0809] via-[#0A0809]/50 to-transparent" aria-hidden />
        <div className="relative px-5 pb-5 pt-24">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#F6C25B]">Launch drop · {drop.cafe.name}</p>
          <h1 className="mt-2 font-heading text-[34px] font-extrabold leading-[1.05]">{drop.title}</h1>
          {drop.tagline && <p className="mt-2 text-[15px] text-[#EDE6E0]">{drop.tagline}</p>}
          <div className="mt-4 flex flex-wrap gap-2 text-sm font-semibold">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-black/50 px-3 py-1.5">
              <Ticket className="h-4 w-4 text-[#F6C25B]" /> {drop.seatsLeft} of {drop.seatsTotal} seats left
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-black/50 px-3 py-1.5">{rupees(drop.pricePerHour)} an hour</span>
          </div>
        </div>
      </section>

      {/* Your seats */}
      {paid.map((r) => (
        <Confirmation key={r.id} drop={drop} r={r} fresh={r.id === justPaid} onShare={onShare} pageUrl={pageUrl} />
      ))}
      {pending && !busy && (
        <div className="mt-4 rounded-2xl border border-[#6B5A2A] bg-[#221D11] p-4">
          <p className="font-semibold">
            {pending.seats} {pending.seats === 1 ? 'seat' : 'seats'} on hold until{' '}
            {new Date(pending.expiresAt!).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' })}
          </p>
          <p className="mt-1 text-sm text-[#DADCE3]">Pay {rupees(pending.deposit)} to keep them. If you don’t, they go back to everyone.</p>
          {pending.orderId && (
            <button
              type="button"
              onClick={() => {
                setBusy(true);
                pay(pending, { orderId: pending.orderId!, amount: pending.deposit, currency: 'INR' });
              }}
              className="mt-3 flex h-12 w-full items-center justify-center rounded-xl bg-[#F6C25B] font-bold text-[#231A05]"
            >
              Pay {rupees(pending.deposit)} now
            </button>
          )}
        </div>
      )}

      {/* Where */}
      <a
        href={drop.cafe.mapsUrl}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => onShare('map', 'cafe_row')}
        className="mt-4 flex items-center gap-3 rounded-2xl border border-[#262932] bg-[#16181E] px-4 py-3 transition-colors hover:border-[#3A3E4A]"
      >
        <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-[#2A1A18]">
          <MapPin className="h-5 w-5 text-[#E8675D]" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{drop.cafe.name}</span>
          <span className="block truncate text-xs text-[#A3A6B1]">{drop.cafe.address || drop.cafe.city}</span>
          <span className="mt-0.5 block text-xs font-semibold text-[#E8675D]">Tap to open in Google Maps</span>
        </span>
        <ChevronRight className="h-4 w-4 text-[#A3A6B1]" />
      </a>

      {/* Price, in plain words */}
      <div className="mt-3 rounded-2xl border border-[#262932] bg-[#16181E] px-4 py-3">
        <p className="font-semibold">{rupees(drop.pricePerHour)} an hour for each seat</p>
        <p className="mt-1 text-sm text-[#A3A6B1]">
          Pay {rupees(drop.deposit)} a seat now to hold it. Pay the rest at the café. Up to {drop.maxSeatsPerUser} seats each. No coupons on drops.
        </p>
      </div>

      {/* When reservations open */}
      {drop.state === 'soon' && (
        <Waitlist drop={drop} onJoined={load} text={`Reservations open on ${whenText(drop.publicStartsAt)}.`} />
      )}
      {drop.state === 'early' && (
        <div className="mt-3 rounded-2xl border border-[#4A3A6B] bg-[#1A1526] px-4 py-3 text-sm">
          <p className="flex items-center gap-2 font-semibold">
            <KeyRound className="h-4 w-4 text-[#C7B4FF]" /> Early access is on
          </p>
          <p className="mt-1 text-[#DADCE3]">
            Only people with the early access code can reserve now. Everyone else can reserve from {whenText(drop.publicStartsAt)}.
          </p>
        </div>
      )}
      {drop.state === 'cancelled' && (
        <p className="mt-3 rounded-2xl border border-[#5A2A26] bg-[#1A1114] px-4 py-3 text-sm">This drop was cancelled. Anyone who paid gets their money back.</p>
      )}

      {/* Times */}
      <section className="mt-6">
        <h2 className="font-heading text-xl font-bold">{canReserve ? 'Pick a time' : 'Times'}</h2>
        <div className="mt-3 flex flex-col gap-2.5" role="radiogroup" aria-label="Times">
          {drop.blocks.map((b) => {
            const gone = b.started || b.seatsLeft === 0;
            const on = b.id === blockId;
            return (
              <button
                key={b.id}
                type="button"
                role="radio"
                aria-checked={on}
                disabled={!canReserve || gone}
                onClick={() => pick(b)}
                className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-colors ${
                  on ? 'border-[#F6C25B] bg-[#241D10]' : 'border-[#262932] bg-[#16181E]'
                } ${gone ? 'opacity-50' : canReserve ? 'hover:border-[#3A3E4A]' : ''}`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{dayLabel(b.date)}</span>
                  <span className="mt-0.5 flex items-center gap-1 text-sm text-[#A3A6B1]">
                    <Clock className="h-3.5 w-3.5" /> {blockTimes(b)}
                  </span>
                  <span className="mt-0.5 block text-sm text-[#DADCE3]">{rupees(b.pricePerSeat)} a seat</span>
                </span>
                <span className="flex flex-col items-end gap-1.5">
                  <span className={`text-sm font-bold ${b.seatsLeft === 0 ? 'text-[#E8675D]' : 'text-[#F4F1EC]'}`}>
                    {b.started ? 'Started' : b.seatsLeft === 0 ? 'Sold out' : `${b.seatsLeft} of ${b.seatsTotal} left`}
                  </span>
                  <span className="flex gap-1" aria-hidden>
                    {Array.from({ length: Math.min(b.seatsTotal, 12) }, (_, i) => (
                      <span key={i} className={`h-2.5 w-2.5 rounded-full ${i < b.seatsTotal - b.seatsLeft ? 'bg-[#3A3E4A]' : 'bg-[#F6C25B]'}`} />
                    ))}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Reserve form */}
      {canReserve && block && (
        <section className="mt-5 rounded-2xl border border-[#262932] bg-[#16181E] p-4">
          {seatsAllowed === 0 ? (
            <p className="text-sm">You already have {drop.maxSeatsPerUser} seats for this drop. That’s the most one person can reserve.</p>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <span className="font-semibold">Seats</span>
                <span className="flex items-center gap-3">
                  <button
                    type="button"
                    aria-label="One seat less"
                    onClick={() => setSeats(Math.max(1, seatCount - 1))}
                    disabled={seatCount <= 1}
                    className="flex h-11 w-11 items-center justify-center rounded-full border border-[#3A3E4A] disabled:opacity-40"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <span className="w-6 text-center text-lg font-bold" aria-live="polite">
                    {seatCount}
                  </span>
                  <button
                    type="button"
                    aria-label="One seat more"
                    onClick={() => setSeats(Math.min(maxSeats, seatCount + 1))}
                    disabled={seatCount >= maxSeats}
                    className="flex h-11 w-11 items-center justify-center rounded-full border border-[#3A3E4A] disabled:opacity-40"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </span>
              </div>
              {needsCode && (
                <label className="mt-4 block">
                  <span className="text-sm font-semibold">Early access code</span>
                  <input
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    autoCapitalize="characters"
                    autoComplete="off"
                    placeholder="Type the code"
                    className="mt-1.5 h-12 w-full rounded-xl border border-[#3A3E4A] bg-[#0E0F13] px-3 text-base tracking-wider outline-none focus:border-[#F6C25B]"
                  />
                </label>
              )}
              {isAuthenticated && drop.needsPhone && (
                <label className="mt-4 block">
                  <span className="text-sm font-semibold">Your mobile number</span>
                  <input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder="10-digit number"
                    className="mt-1.5 h-12 w-full rounded-xl border border-[#3A3E4A] bg-[#0E0F13] px-3 text-base outline-none focus:border-[#F6C25B]"
                  />
                  <span className="mt-1 block text-xs text-[#A3A6B1]">So the café can reach you about your seat.</span>
                </label>
              )}
              <dl className="mt-4 space-y-1 text-sm">
                <Row k={`Pay now (${rupees(drop.deposit)} × ${seatCount})`} v={rupees(drop.deposit * seatCount)} strong />
                <Row k="Pay at the café" v={rupees(block.balancePerSeat * seatCount)} />
                <Row k="Total" v={rupees(block.pricePerSeat * seatCount)} />
              </dl>
              <p className="mt-2 text-xs text-[#A3A6B1]">We hold your seats for 10 minutes while you pay.</p>
            </>
          )}
          {error && <p className="mt-3 rounded-xl bg-[#2A1513] px-3 py-2 text-sm text-[#FFB4AC]">{error}</p>}
        </section>
      )}
      {error && !(canReserve && block) && <p className="mt-3 rounded-xl bg-[#2A1513] px-3 py-2 text-sm text-[#FFB4AC]">{error}</p>}

      {drop.state === 'early' && <Waitlist drop={drop} onJoined={load} text="No code? Get a message when everyone can reserve." quiet />}

      {/* Share */}
      <section className="mt-8">
        <h2 className="font-heading text-xl font-bold">Tell your friends</h2>
        <p className="mt-1 text-sm text-[#A3A6B1]">Seats are few. Send it to the people you want to play with.</p>
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

      {/* Questions */}
      <section className="mt-8">
        <h2 className="font-heading text-xl font-bold">Questions</h2>
        <dl className="mt-3 flex flex-col divide-y divide-[#262932] rounded-2xl border border-[#262932] bg-[#16181E]">
          <Faq q="What do I pay now?" a={`${rupees(drop.deposit)} for each seat. It holds your seat. You pay the rest at the café on the day.`} />
          <Faq q="How do I get in?" a="After you pay, you get a QR pass here. Show it at the café." />
          <Faq q="Can I bring friends?" a={`Yes. You can reserve up to ${drop.maxSeatsPerUser} seats. Friends can also reserve their own.`} />
          <Faq q="Can I use a coupon?" a="No. Drop prices are fixed. Coupons and café offers don’t work on drops." />
          <Faq q="What if the café cancels?" a="You get your deposit back in full." />
        </dl>
      </section>

      {/* Sticky: pay when a time is picked, otherwise share on WhatsApp */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[#262932] bg-[#0E0F13]/95 px-4 pb-[max(env(safe-area-inset-bottom),12px)] pt-3 backdrop-blur">
        <div className="mx-auto max-w-xl">
          {canReserve && block && seatsAllowed > 0 ? (
            <button
              type="button"
              onClick={reserve}
              disabled={busy}
              className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#F6C25B] text-[17px] font-bold text-[#231A05] transition-colors hover:bg-[#EDB544] disabled:opacity-60"
            >
              {busy
                ? 'Opening payment…'
                : isAuthenticated || !isHydrated
                ? `Pay ${rupees(drop.deposit * seatCount)} to hold ${seatCount === 1 ? 'your seat' : `${seatCount} seats`}`
                : 'Sign in to reserve'}
            </button>
          ) : (
            <WhatsAppButton text={shareText} url={pageUrl} label="Share with friends on WhatsApp" onShare={(c) => onShare(c, 'sticky')} />
          )}
        </div>
      </div>

      <MockPaymentModal
        isOpen={mockModalState?.isOpen || false}
        orderId={mockModalState?.orderId || ''}
        amount={mockModalState?.amount || 0}
        onSuccess={mockModalState?.onSuccess || (() => {})}
        onFailure={mockModalState?.onFailure || (() => {})}
        onClose={mockModalState?.onClose || (() => {})}
      />
    </Shell>
  );
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
  return (
    <section className={`mt-4 rounded-3xl border p-4 ${fresh ? 'border-[#7FE0A0] bg-[#12241A]' : 'border-[#2F4A38] bg-[#13201A]'}`}>
      <p className="flex items-center gap-2 text-lg font-bold text-[#9BF0B9]">
        <Check className="h-5 w-5" /> {r.status === 'checked_in' ? 'You’re checked in' : fresh ? 'Your seat is booked!' : 'Your seat is booked'}
      </p>
      {b && (
        <p className="mt-1 text-[15px]">
          {dayLabel(b.date)} · {blockTimes(b)} · {r.seats} {r.seats === 1 ? 'seat' : 'seats'}
        </p>
      )}
      {r.qr && (
        <div className="mt-4 flex flex-col items-center rounded-2xl bg-white p-4 text-[#0E0F13]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={r.qr} alt="Your check-in QR code" className="h-52 w-52" />
          <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-[#555]">Show this at the café</p>
          <p className="font-mono text-lg font-bold">{r.reference}</p>
        </div>
      )}
      <dl className="mt-4 space-y-1 text-sm">
        <Row k="Paid now" v={rupees(r.depositPaid)} />
        <Row k="Pay at the café" v={rupees(r.balanceDue)} strong />
      </dl>
      {r.passUrl && (
        <Link href={new URL(r.passUrl).pathname} className="mt-3 block text-center text-sm font-semibold text-[#9BF0B9] underline-offset-2 hover:underline">
          Open my pass on its own page
        </Link>
      )}
      <div className="mt-4">
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
    <section className={`mt-3 rounded-2xl border px-4 py-3 ${quiet ? 'border-[#262932] bg-[#16181E]' : 'border-[#4A3A6B] bg-[#1A1526]'}`}>
      <p className="flex items-center gap-2 font-semibold">
        <Bell className="h-4 w-4 text-[#C7B4FF]" /> {text}
      </p>
      {drop.waitlistCount > 0 && <p className="mt-1 text-sm text-[#A3A6B1]">{drop.waitlistCount} people are waiting.</p>}
      {state === 'done' ? (
        <p className="mt-2 text-sm font-semibold text-[#9BF0B9]">Done. We’ll send you a message when it opens.</p>
      ) : (
        <div className="mt-2 flex gap-2">
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            inputMode="tel"
            autoComplete="tel"
            placeholder="Your mobile number"
            aria-label="Your mobile number"
            className="h-12 min-w-0 flex-1 rounded-xl border border-[#3A3E4A] bg-[#0E0F13] px-3 text-base outline-none focus:border-[#C7B4FF]"
          />
          <button
            type="button"
            onClick={join}
            disabled={state === 'busy' || phone.replace(/\D/g, '').length < 10}
            className="h-12 rounded-xl bg-[#C7B4FF] px-4 font-bold text-[#1A1030] disabled:opacity-50"
          >
            Notify me
          </button>
        </div>
      )}
      {error && <p className="mt-2 text-sm text-[#FFB4AC]">{error}</p>}
    </section>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#0A0809] text-[#F4F1EC]">
      <header className="mx-auto flex max-w-xl items-center px-4 pt-4">
        <Link
          href="/"
          aria-label="Back to the KHEL-O home page"
          className="inline-flex h-11 items-center gap-1.5 rounded-full border border-white/20 bg-black/60 pl-3 pr-4 text-sm font-semibold"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden /> Home
        </Link>
      </header>
      <main className="mx-auto max-w-xl px-4 pb-32 pt-4">{children}</main>
    </div>
  );
}

function Row({ k, v, strong = false }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-[#A3A6B1]">{k}</dt>
      <dd className={strong ? 'font-bold text-[#F4F1EC]' : 'text-[#DADCE3]'}>{v}</dd>
    </div>
  );
}

function Faq({ q, a }: { q: string; a: string }) {
  return (
    <div className="px-4 py-3">
      <dt className="font-semibold">{q}</dt>
      <dd className="mt-1 text-sm text-[#A3A6B1]">{a}</dd>
    </div>
  );
}
