'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, CheckCircle2, RotateCcw } from 'lucide-react';
import { ApiError } from '@/lib/api/errors';
import { deskCheckin, type DeskPlayerResult } from '@/lib/api/teamChallenges';

/** Staff scan a team-challenge player's QR: checks them in and says who and which team. */
export function TeamDoor({ slug, token }: { slug: string; token: string }) {
  const [r, setR] = useState<DeskPlayerResult | null>(null);
  const [error, setError] = useState<{ message: string; notStaff: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const send = useCallback(async (present: boolean) => {
    setBusy(true);
    try {
      setR(await deskCheckin(slug, token, present));
      setError(null);
    } catch (e) {
      setError({ message: (e as Error).message || 'That didn’t work. Try again.', notStaff: e instanceof ApiError && e.code === 'NOT_DOOR_STAFF' });
    } finally {
      setBusy(false);
    }
  }, [slug, token]);

  useEffect(() => {
    send(true);
  }, [send]);

  const playing = r?.status === 'active';

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#0A0809] px-6 text-center text-[#F4F1EC]">
      {!r && !error && <p className="text-[#B4B0B8]">Checking in…</p>}
      {error && (
        <>
          <AlertTriangle className="h-16 w-16 text-[#F2C94C]" />
          <h1 className="mt-4 text-2xl font-bold">{error.notStaff ? 'Show this QR at the desk' : 'Couldn’t check in'}</h1>
          <p className="mt-2 max-w-sm text-[#C9CBD3]">{error.notStaff ? 'The KHELO team or the café scans it to check you in.' : error.message}</p>
          <Link href={`/challenge/${slug}/me`} className="mt-6 text-sm font-semibold text-[#E8675D]">Open my entry</Link>
        </>
      )}
      {r && (
        <>
          {r.checkedIn ? <CheckCircle2 className={`h-20 w-20 ${playing ? 'text-[#7FE0A0]' : 'text-[#F2C94C]'}`} /> : <RotateCcw className="h-16 w-16 text-[#B4B0B8]" />}
          <h1 className="mt-4 text-[34px] font-bold leading-tight">{r.fullName}</h1>
          <p className="text-[#B4B0B8]">{r.riotId}</p>
          <p className={`mt-4 rounded-full px-4 py-1.5 text-lg font-bold ${playing ? 'bg-[#13221A] text-[#7FE0A0]' : 'bg-[#221D13] text-[#F2C94C]'}`}>
            {r.teamName ? `${r.teamName}${r.role === 'sub' ? ' · substitute' : r.role === 'captain' ? ' · captain' : ''}` : r.role === 'solo' ? 'Solo, no team yet' : 'No team'}
          </p>
          <p className="mt-4 max-w-sm text-[#C9CBD3]">
            {!r.checkedIn ? 'Check-in undone.' : r.already ? 'Already checked in.' : playing ? 'Checked in. Ready to play.' : 'Checked in, but they are not in a playing team. Check the admin desk.'}
          </p>
          <button type="button" disabled={busy} onClick={() => send(!r.checkedIn)} className="mt-8 h-12 rounded-xl border border-[#3A3E4A] px-5 font-semibold disabled:opacity-50">
            {r.checkedIn ? 'Undo check-in' : 'Check in again'}
          </button>
          <p className="mt-6 text-sm text-[#B4B0B8]">Scan the next QR with your camera.</p>
        </>
      )}
    </div>
  );
}
