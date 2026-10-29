'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CalendarDays, MapPin, MessageCircle, Swords, Users, X } from 'lucide-react';
import { trackAction } from '@/lib/api/analyticsEvents';
import { COMMUNITY_URL, challengeDay, challengeTimeRange, openToAll, startsInWords } from '@/lib/challenge';
import { markChallengeSeen, useChallengeNudge, writeNudge } from '@/lib/challengeNudge';

const SHOW_AFTER_MS = 2500;
// Never over a booking: the café page has its own Book bar, checkout its pay bar.
const quietPath = (p: string) => p.startsWith('/cafe/') || p.startsWith('/bookings/new');

/** The element the sheet shrinks into: the Profile tab that's on screen. */
function dockTarget(): HTMLElement | null {
  const all = Array.from(document.querySelectorAll<HTMLElement>('[data-challenge-dock]'));
  return all.find((el) => el.offsetParent !== null && el.getBoundingClientRect().width > 0) ?? null;
}

/**
 * Upcoming challenge, once per device: a half-page sheet a few seconds after
 * the page settles. Closing it (✕, or tapping the dimmed page) shrinks it into
 * the Profile tab, which then carries a "New" tag pointing at My challenges.
 */
export function ChallengePopup() {
  const pathname = usePathname();
  const { challenge: ch, mayPopUp } = useChallengeNudge();
  const [open, setOpen] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const closing = useRef(false);

  useEffect(() => {
    if (!mayPopUp || open || quietPath(pathname)) return;
    let timer = 0;
    const tryShow = () => {
      // Another sheet or dialog is up (phone number ask, sign-in): wait it out.
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) {
        timer = window.setTimeout(tryShow, 3000);
        return;
      }
      setOpen(true);
    };
    timer = window.setTimeout(tryShow, SHOW_AFTER_MS);
    return () => window.clearTimeout(timer);
  }, [mayPopUp, open, pathname]);

  // Slide up.
  useEffect(() => {
    if (!open || !sheetRef.current || !ch) return;
    trackAction('challenge_popup_shown', { challenge: ch.slug, path: pathname });
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    backdropRef.current?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, fill: 'both' });
    sheetRef.current.animate(
      reduce
        ? [{ opacity: 0 }, { opacity: 1 }]
        : [
            { transform: 'translateY(100%)', opacity: 0.6 },
            { transform: 'translateY(-8px)', opacity: 1, offset: 0.8 },
            { transform: 'none', opacity: 1 },
          ],
      { duration: reduce ? 150 : 560, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'both' },
    );
    sheetRef.current.focus({ preventScroll: true });
    // Only for the open effect: pathname is read once for the event.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, ch]);

  const dock = useCallback(
    (how: string) => {
      const sheet = sheetRef.current;
      if (!sheet || !ch || closing.current) return;
      closing.current = true;
      trackAction('challenge_popup_docked', { challenge: ch.slug, how });
      const finish = () => {
        writeNudge(ch.slug, 'docked');
        setOpen(false);
        closing.current = false;
        dockTarget()?.animate(
          [{ transform: 'scale(1)' }, { transform: 'scale(1.3)' }, { transform: 'scale(.94)' }, { transform: 'scale(1)' }],
          { duration: 480, easing: 'ease-out' },
        );
      };
      backdropRef.current?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 420, fill: 'forwards' });
      const target = dockTarget();
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (!target || reduce) {
        sheet.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, fill: 'forwards' }).onfinish = finish;
        return;
      }
      const from = sheet.getBoundingClientRect();
      const to = target.getBoundingClientRect();
      const dx = to.left + to.width / 2 - (from.left + from.width / 2);
      const dy = to.top + to.height / 2 - (from.top + from.height / 2);
      const s = Math.max(0.04, Math.min(to.width / from.width, 0.15));
      sheet.animate(
        [
          { transform: 'none', opacity: 1, borderRadius: '28px' },
          { transform: `translate(${dx * 0.3}px, ${dy * 0.25 - 30}px) scale(.55)`, opacity: 1, borderRadius: '40px', offset: 0.35 },
          { transform: `translate(${dx}px, ${dy}px) scale(${s})`, opacity: 0.1, borderRadius: '999px' },
        ],
        { duration: 680, easing: 'cubic-bezier(.5,0,.75,0)', fill: 'forwards' },
      ).onfinish = finish;
    },
    [ch],
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && dock('escape');
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, dock]);

  if (!open || !ch) return null;
  const spots =
    ch.status !== 'open'
      ? 'Player sign-ups closed · come watch'
      : openToAll(ch.capacity)
      ? `${ch.confirmed > 0 ? `${ch.confirmed} already in · ` : ''}free to play ${startsInWords(ch.startsAt)}`
      : ch.spotsLeft === 0
        ? `All ${ch.capacity} player spots taken · reserve list open`
        : `${ch.spotsLeft} of ${ch.capacity} player spots left`;

  return (
    <>
      <div
        ref={backdropRef}
        onClick={() => dock('outside')}
        className="fixed inset-0 z-modal bg-black/55"
        style={{ opacity: 0 }}
        aria-hidden
      />
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label="Upcoming challenge"
        tabIndex={-1}
        className="fixed inset-x-0 bottom-0 z-modal mx-auto flex min-h-[52vh] w-full max-w-xl flex-col rounded-t-[28px] border border-b-0 border-[#5A2A26] bg-[#1A1114] px-5 pb-[calc(20px+env(safe-area-inset-bottom))] pt-3 text-[#F4F1EC] shadow-overlay outline-none"
        style={{
          opacity: 0,
          backgroundImage: 'radial-gradient(700px 360px at 90% 0%, rgba(208,70,60,.30), transparent 65%)',
        }}
      >
        <div className="mx-auto h-1.5 w-10 rounded-full bg-white/20" aria-hidden />
        <div className="mt-3 flex items-start justify-between gap-3">
          <p className="pt-1 text-[11px] font-bold uppercase tracking-[0.1em] text-[#E8675D]">
            <span className="mr-2 rounded bg-[#F2C94C] px-1.5 py-0.5 text-[10px] text-[#1A1114]">NEW</span>
            Free challenge · {ch.game}
          </p>
          <button
            type="button"
            onClick={() => dock('close')}
            aria-label="Close"
            className="-mr-2 -mt-1 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-[#A3A6B1] hover:bg-white/10 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-1 flex items-center gap-3">
          <span className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl bg-[#D0463C] text-white">
            <Swords className="h-7 w-7" aria-hidden />
          </span>
          <h2 className="font-heading text-[1.7rem] font-bold leading-tight">{ch.title}</h2>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
            <CalendarDays className="h-4 w-4 text-[#E8675D]" aria-hidden />
            <p className="mt-1 text-sm font-semibold">{challengeDay(ch.startsAt)}</p>
            <p className="text-caption text-[#A3A6B1]">{challengeTimeRange(ch.startsAt, ch.endsAt)}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
            <MapPin className="h-4 w-4 text-[#E8675D]" aria-hidden />
            <p className="mt-1 text-sm font-semibold leading-snug">{ch.cafe.name}</p>
            <p className="text-caption text-[#A3A6B1]">{ch.cafe.city}</p>
          </div>
        </div>

        <p className="mt-3 text-base font-bold text-[#F2C94C]">{spots} · free sign-up</p>
        <div className="mt-2 flex items-start gap-2 rounded-2xl border border-[#3B6B4A] bg-[#13221A] p-3 text-sm text-[#DADCE3]">
          <Users className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#7FE0A0]" aria-hidden />
          <span>
            <b className="text-[#7FE0A0]">Not playing? Come watch.</b> Anyone can come.
            {ch.visitorOffer ? ` ${ch.visitorOffer}.` : ''}
          </span>
        </div>

        <div className="mt-auto flex flex-col gap-2 pt-5">
          <Link
            href={`/challenge/${ch.slug}?join=1`}
            onClick={() => {
              trackAction('challenge_teaser_click', { challenge: ch.slug, where: 'popup' });
              markChallengeSeen(ch.slug);
            }}
            className="flex min-h-[52px] items-center justify-center rounded-2xl bg-[#D0463C] text-base font-bold text-white hover:bg-[#E8675D]"
          >
            Lock my spot
          </Link>
          <a
            href={COMMUNITY_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => trackAction('community_join_tap', { where: 'popup' })}
            className="flex min-h-[48px] items-center justify-center gap-2 rounded-2xl border border-[#3B6B4A] text-sm font-semibold text-[#7FE0A0] hover:bg-[#13221A]"
          >
            <MessageCircle className="h-4 w-4" aria-hidden /> Join our WhatsApp Community
          </a>
          <p className="text-center text-[11px] text-[#7D808B]">Close it any time. It stays in Profile → My challenges.</p>
        </div>
      </div>
    </>
  );
}
