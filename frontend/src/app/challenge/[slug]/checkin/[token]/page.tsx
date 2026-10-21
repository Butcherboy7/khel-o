'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { CheckCircle2, AlertTriangle, Hourglass, RotateCcw } from 'lucide-react';
import { AuthGuard } from '@/components/layout/AuthGuard';
import { doorCheckin, type DoorResult } from '@/lib/api/challenges';
import { ApiError } from '@/lib/api/errors';

/** Opened by scanning a player's QR at the door. Signed in as KHELO staff or
 *  the café's owner, it checks them in straight away and says who it was. */
export default function DoorCheckinPage() {
  return (
    <AuthGuard allowedRoles={['gamer', 'cafe_owner', 'staff', 'admin']}>
      <Door />
    </AuthGuard>
  );
}

function Door() {
  const { slug, token } = useParams<{ slug: string; token: string }>();
  const [result, setResult] = useState<DoorResult | null>(null);
  const [error, setError] = useState<{ message: string; notStaff: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const send = useCallback(
    async (present: boolean) => {
      setBusy(true);
      try {
        setResult(await doorCheckin(slug, token, present));
        setError(null);
      } catch (e) {
        const notStaff = e instanceof ApiError && e.code === 'NOT_DOOR_STAFF';
        setError({ message: (e as Error).message || 'That didn’t work. Try again.', notStaff });
      } finally {
        setBusy(false);
      }
    },
    [slug, token],
  );

  useEffect(() => {
    send(true);
  }, [send]);

  const waitlist = result?.status === 'waitlist';
  const out = result && result.status !== 'confirmed' && result.status !== 'waitlist';

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#0E0F13] px-6 text-center text-[#F4F1EC]">
      {!result && !error && <p className="text-[#A3A6B1]">Checking in…</p>}

      {error && (
        <>
          <AlertTriangle className="h-16 w-16 text-[#F2C27A]" />
          <h1 className="mt-4 font-heading text-2xl font-bold">
            {error.notStaff ? 'Show this QR at the door' : 'Couldn’t check in'}
          </h1>
          <p className="mt-2 max-w-sm text-[#C9CBD3]">
            {error.notStaff ? 'The KHELO team or the café scans it to check you in.' : error.message}
          </p>
          <Link href={`/challenge/${slug}/me`} className="mt-6 text-sm font-semibold text-[#E8675D]">
            Open my challenge page
          </Link>
        </>
      )}

      {result && (
        <>
          {result.present ? (
            waitlist ? <Hourglass className="h-20 w-20 text-[#F2C27A]" /> : <CheckCircle2 className="h-20 w-20 text-[#7FE0A0]" />
          ) : (
            <RotateCcw className="h-16 w-16 text-[#A3A6B1]" />
          )}
          <h1 className="mt-4 font-heading text-[34px] font-bold leading-tight">{result.name}</h1>
          {result.publicName !== result.name && <p className="text-[#A3A6B1]">{result.publicName}</p>}
          <p
            className={`mt-4 rounded-full px-4 py-1.5 text-lg font-bold ${
              out ? 'bg-[#5A2A26] text-[#FFB4AC]' : waitlist ? 'bg-[#221D13] text-[#F2C27A]' : 'bg-[#13221A] text-[#7FE0A0]'
            }`}
          >
            {result.status === 'confirmed'
              ? `Confirmed #${result.rank}`
              : waitlist
                ? `Waitlist #${result.rank}`
                : result.status === 'no_show'
                  ? 'Marked no-show'
                  : 'Dropped out'}
          </p>
          <p className="mt-4 max-w-sm text-[#C9CBD3]">
            {!result.present
              ? 'Check-in undone.'
              : result.alreadyIn
                ? 'Already checked in.'
                : waitlist
                  ? 'Checked in. They play if a spot is free when check-in closes.'
                  : out
                    ? 'Checked in, but they’re not in the line-up. Put them back from the admin page if they should play.'
                    : 'Checked in. Ready to play.'}
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => send(!result.present)}
            className="mt-8 h-12 rounded-xl border border-[#3A3E4A] px-5 font-semibold text-[#F4F1EC] disabled:opacity-50"
          >
            {result.present ? 'Undo check-in' : 'Check in again'}
          </button>
          <p className="mt-6 text-sm text-[#A3A6B1]">Scan the next QR with your camera.</p>
        </>
      )}
    </div>
  );
}
