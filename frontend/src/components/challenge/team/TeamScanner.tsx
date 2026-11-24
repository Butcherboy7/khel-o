'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Script from 'next/script';
import { AlertTriangle, Camera, CheckCircle2, ScanLine } from 'lucide-react';
import { ApiError } from '@/lib/api/errors';
import { deskCheckin, type DeskPlayerResult } from '@/lib/api/teamChallenges';

interface Scanner {
  start: (cam: unknown, cfg: unknown, ok: (text: string) => void, err?: () => void) => Promise<unknown>;
  stop: () => Promise<unknown>;
  clear: () => void;
}
type ScannerCtor = new (id: string, verbose?: boolean) => Scanner;
const lib = () => (window as unknown as { Html5Qrcode?: ScannerCtor }).Html5Qrcode;

const TOKEN = /\/checkin\/(p[0-9a-f]{48})/i;

type Shown = { ok: true; r: DeskPlayerResult } | { ok: false; message: string; notStaff: boolean };

/** Door scanner for staff: opens the camera inside KHELO, reads a player's QR and checks them in.
 *  Admin or the café owner, signed in. One tap to start, then it keeps scanning. */
export function TeamScanner({ slug }: { slug: string }) {
  const [ready, setReady] = useState(false);
  const [on, setOn] = useState(false);
  const [camError, setCamError] = useState<string | null>(null);
  const [shown, setShown] = useState<Shown | null>(null);
  const [count, setCount] = useState(0);
  const sc = useRef<Scanner | null>(null);
  const busy = useRef(false);

  const stop = useCallback(async () => {
    const s = sc.current;
    sc.current = null;
    setOn(false);
    if (s) {
      try {
        await s.stop();
      } catch {
        /* already stopped */
      }
      try {
        s.clear();
      } catch {
        /* nothing to clear */
      }
    }
  }, []);

  useEffect(
    () => () => {
      void stop();
    },
    [stop],
  );

  const handle = useCallback(
    async (text: string) => {
      if (busy.current) return;
      const m = TOKEN.exec(text);
      busy.current = true;
      if (!m) {
        setShown({ ok: false, message: 'That QR isn’t a KHELO check-in code.', notStaff: false });
      } else {
        try {
          const r = await deskCheckin(slug, m[1], true);
          setShown({ ok: true, r });
          if (!r.already) setCount((n) => n + 1);
        } catch (e) {
          setShown({
            ok: false,
            message: (e as Error).message || 'That didn’t work. Scan again.',
            notStaff: e instanceof ApiError && e.code === 'NOT_DOOR_STAFF',
          });
        }
      }
      if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(60);
      // Hold the result on screen, then scan the next person without a tap.
      setTimeout(() => {
        busy.current = false;
        setShown(null);
      }, 2600);
    },
    [slug],
  );

  const start = async () => {
    setCamError(null);
    const Ctor = lib();
    if (!Ctor) {
      setCamError('The scanner is still loading. Try again in a moment.');
      return;
    }
    try {
      await stop();
      const s = new Ctor('team-qr-reader');
      sc.current = s;
      await s.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        (t) => void handle(t),
        () => undefined,
      );
      setOn(true);
    } catch {
      sc.current = null;
      setCamError('The camera didn’t open. Allow camera access for khel-o.com in your browser, then try again.');
    }
  };

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col gap-4 bg-[#0A0809] px-4 py-6 text-[#F4F1EC]">
      <Script src="https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js" strategy="afterInteractive" onLoad={() => setReady(true)} />
      <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-[22px] font-bold">
          <ScanLine className="h-6 w-6 text-[#E8675D]" aria-hidden /> Scan to check in
        </h1>
        <span className="rounded-full bg-white/10 px-3 py-1 text-[14px] font-semibold" aria-live="polite">
          {count} checked in
        </span>
      </div>

      <div className="relative overflow-hidden rounded-2xl border border-white/15 bg-black">
        <div id="team-qr-reader" className="min-h-[300px] w-full" />
        {!on && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
            <Camera className="h-10 w-10 text-white/60" aria-hidden />
            <p className="text-[15px] text-white/80">Point the camera at a player’s QR code.</p>
          </div>
        )}
        {shown && (
          <div role="status" className={`absolute inset-0 flex flex-col items-center justify-center gap-2 p-5 text-center ${shown.ok ? 'bg-[#0E2418]' : 'bg-[#2A1512]'}`}>
            {shown.ok ? <CheckCircle2 className="h-16 w-16 text-[#7FE0A0]" aria-hidden /> : <AlertTriangle className="h-14 w-14 text-[#F2C94C]" aria-hidden />}
            {shown.ok ? (
              <>
                <p className="text-[30px] font-bold leading-tight">{shown.r.fullName}</p>
                <p className="text-[15px] text-white/70">{shown.r.riotId}</p>
                <p className="rounded-full bg-white/10 px-4 py-1 text-[16px] font-bold">{shown.r.teamName ?? 'Solo, no team yet'}</p>
                <p className="text-[15px] font-semibold text-[#7FE0A0]">{shown.r.already ? 'Already checked in' : 'Checked in'}</p>
              </>
            ) : (
              <p className="max-w-[28ch] text-[17px] font-semibold">
                {shown.notStaff ? 'Only KHELO staff or the café can check players in. Sign in with that account.' : shown.message}
              </p>
            )}
          </div>
        )}
      </div>

      {camError && (
        <p className="rounded-xl bg-[#2A1512] p-3 text-[14px] text-[#F5B5AE]" role="alert">
          {camError}
        </p>
      )}

      <button
        type="button"
        onClick={on ? stop : start}
        disabled={!ready && !on}
        className="min-h-[52px] rounded-xl bg-[#D0463C] px-5 text-[17px] font-bold text-white disabled:opacity-50"
      >
        {on ? 'Stop camera' : ready ? 'Start scanning' : 'Loading scanner…'}
      </button>
      <p className="text-center text-[13px] text-white/60">
        No camera or a lost QR?{' '}
        <Link href="/admin/challenges" className="font-semibold underline">
          Check people in by name
        </Link>{' '}
        on the desk list.
      </p>
    </div>
  );
}
