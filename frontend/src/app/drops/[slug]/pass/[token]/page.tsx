'use client';

import { use, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Check, ShieldAlert, ShieldCheck } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { checkInDropPass, getDropPass, type DropPass } from '@/lib/api/drops';
import { blockTimes, dayLabel, rupees } from '@/lib/drops';
import { CommunityInviteCard } from '@/components/customer/CommunityInvite';

/** What the QR on a drop pass opens. The holder sees their pass; the café
 *  (owner, staff or admin) sees who it is and a Check in button; anyone else
 *  only learns whether the pass is real. */
export default function DropPassPage({ params }: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = use(params);
  const { isAuthenticated, isHydrated } = useAuthStore();
  const [pass, setPass] = useState<DropPass | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const load = useCallback(() => {
    getDropPass(slug, token)
      .then(setPass)
      .catch((e) => setError((e as Error)?.message || 'This pass isn’t valid.'));
  }, [slug, token]);
  useEffect(() => {
    if (isHydrated) load();
  }, [isHydrated, isAuthenticated, load]);

  const checkIn = async () => {
    setBusy(true);
    try {
      const r = await checkInDropPass(token);
      setDone(r.outcome === 'already' ? `${r.holderName} was already checked in.` : `${r.holderName} is checked in.`);
      load();
    } catch (e) {
      setError((e as Error)?.message || 'Could not check in.');
    } finally {
      setBusy(false);
    }
  };

  const b = pass?.block;
  return (
    <div className="min-h-screen bg-surface/40 text-text-primary">
      <header className="mx-auto flex max-w-md items-center px-4 pt-4">
        <Link
          href={`/drops/${slug}`}
          className="inline-flex h-11 items-center gap-1.5 rounded-full border border-white/20 bg-black/60 pl-3 pr-4 text-sm font-semibold"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden /> Drop page
        </Link>
      </header>
      <main className="mx-auto max-w-md px-4 pb-16 pt-6">
        {error && !pass && (
          <p className="flex items-center gap-2 rounded-2xl border border-error/30 bg-error/10 p-4 font-semibold">
            <ShieldAlert className="h-5 w-5 text-error" /> {error}
          </p>
        )}
        {!pass && !error && <p className="text-center text-text-secondary">Loading…</p>}
        {pass && (
          <>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">{pass.dropTitle}</p>
            <h1 className="mt-1 flex items-center gap-2 font-heading text-2xl font-bold">
              {pass.valid ? <ShieldCheck className="h-6 w-6 text-success" /> : <ShieldAlert className="h-6 w-6 text-error" />}
              {pass.status === 'checked_in'
                ? 'Checked in'
                : pass.valid
                ? 'Valid pass'
                : pass.status === 'refunded'
                ? 'Refunded: not valid'
                : pass.status === 'given_away'
                ? 'Seat given away'
                : 'Not valid'}
            </h1>
            <p className="mt-1 font-mono text-lg">{pass.reference}</p>
            {pass.holderName && (
              <p className="mt-3 text-[15px]">
                <span className="font-semibold">{pass.holderName}</span>
                {pass.holderPhone ? ` · ${pass.holderPhone}` : ''}
              </p>
            )}
            {b && (
              <p className="mt-2 text-[15px] text-text-primary">
                {dayLabel(b.date)} · {pass.hours && pass.startTime && pass.endTime ? `${pass.startTime} to ${pass.endTime}` : blockTimes(b)} · {pass.seats} {pass.seats === 1 ? 'seat' : 'seats'}
              </p>
            )}
            {pass.arriveFrom && pass.arriveUntil && pass.status === 'confirmed' && (
              <p className="mt-3 rounded-xl bg-warning/10 px-3 py-2 text-sm text-text-primary">
                Arrive between {new Date(pass.arriveFrom).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' })} and{' '}
                {new Date(pass.arriveUntil).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' })}. After that the seat can be given away and the fee is not refunded.
              </p>
            )}
            {pass.qr && pass.valid && !pass.canCheckIn && (
              <div className="mt-5 flex flex-col items-center rounded-2xl bg-white p-4 text-[#0E0F13]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={pass.qr} alt="Check-in QR code" className="h-56 w-56" />
                <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-[#555]">Show this at the café</p>
              </div>
            )}
            {pass.balanceDue !== undefined && pass.valid && (
              <div className="mt-5 rounded-2xl border border-warning/40 bg-warning/10 p-4">
                <p className="text-sm text-text-primary">To pay at the café</p>
                <p className="text-3xl font-extrabold">{rupees(pass.balanceDue)}</p>
                <p className="mt-1 text-xs text-text-secondary">Already paid online: {rupees(pass.depositPaid ?? 0)}</p>
              </div>
            )}
            {done && (
              <p className="mt-5 flex items-center gap-2 rounded-2xl bg-success/10 p-4 font-semibold text-success">
                <Check className="h-5 w-5" /> {done}
              </p>
            )}
            {pass.canCheckIn && (
              <button
                type="button"
                onClick={checkIn}
                disabled={busy}
                className="mt-5 flex h-14 w-full items-center justify-center rounded-2xl bg-[#7FE0A0] text-lg font-bold text-[#06240F] disabled:opacity-60"
              >
                {busy ? 'Checking in…' : 'Check in'}
              </button>
            )}
            {!isAuthenticated && isHydrated && (
              <Link
                href={`/login?redirect=${encodeURIComponent(`/drops/${slug}/pass/${token}`)}`}
                className="mt-5 block text-center text-sm font-semibold text-error"
              >
                Your pass, or you work at the café? Sign in to see more
              </Link>
            )}
            {pass.valid && !pass.canCheckIn && (
              <div className="mt-5">
                <CommunityInviteCard where="drop_pass" />
              </div>
            )}
            {error && pass && <p className="mt-3 text-sm text-error">{error}</p>}
          </>
        )}
      </main>
    </div>
  );
}
