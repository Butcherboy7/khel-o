'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MessageCircle, Swords, X } from 'lucide-react';
import { trackAction } from '@/lib/api/analyticsEvents';
import { COMMUNITY_URL, challengeDay, challengeTimeRange } from '@/lib/challenge';
import { markChallengeSeen, useChallengeNudge, writeNudge } from '@/lib/challengeNudge';

const SHOW_AFTER_MS = 2500;
// Never over a booking: the café page has its own Book bar, checkout its pay bar.
const quietPath = (p: string) => p.startsWith('/cafe/') || p.startsWith('/bookings/new');

/** The element the card shrinks into: the Profile tab that's on screen. */
function dockTarget(): HTMLElement | null {
  const all = Array.from(document.querySelectorAll<HTMLElement>('[data-challenge-dock]'));
  return all.find((el) => el.offsetParent !== null && el.getBoundingClientRect().width > 0) ?? null;
}

/**
 * Upcoming challenge, once per device: slides up a few seconds after the page
 * settles. Closing it (✕, or tapping anywhere else) shrinks it into the
 * Profile tab, which then carries a "New" tag pointing at My challenges.
 */
export function ChallengePopup() {
  const pathname = usePathname();
  const { challenge: ch, mayPopUp } = useChallengeNudge();
  const [open, setOpen] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
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

  // Slide in.
  useEffect(() => {
    if (!open || !cardRef.current || !ch) return;
    trackAction('challenge_popup_shown', { challenge: ch.slug, path: pathname });
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    cardRef.current.animate(
      reduce
        ? [{ opacity: 0 }, { opacity: 1 }]
        : [
            { transform: 'translateY(110%) scale(.96)', opacity: 0 },
            { transform: 'translateY(-6px) scale(1)', opacity: 1, offset: 0.75 },
            { transform: 'none', opacity: 1 },
          ],
      { duration: reduce ? 150 : 520, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'both' },
    );
    // Only for the open effect: pathname is read once for the event.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, ch]);

  const dock = useCallback(
    (how: string) => {
      const card = cardRef.current;
      if (!card || !ch || closing.current) return;
      closing.current = true;
      trackAction('challenge_popup_docked', { challenge: ch.slug, how });
      const finish = () => {
        writeNudge(ch.slug, 'docked');
        setOpen(false);
        closing.current = false;
        const t = dockTarget();
        t?.animate(
          [{ transform: 'scale(1)' }, { transform: 'scale(1.25)' }, { transform: 'scale(.95)' }, { transform: 'scale(1)' }],
          { duration: 450, easing: 'ease-out' },
        );
      };
      const target = dockTarget();
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (!target || reduce) {
        card.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 180, fill: 'forwards' }).onfinish = finish;
        return;
      }
      const from = card.getBoundingClientRect();
      const to = target.getBoundingClientRect();
      const dx = to.left + to.width / 2 - (from.left + from.width / 2);
      const dy = to.top + to.height / 2 - (from.top + from.height / 2);
      const s = Math.max(0.06, Math.min(to.width / from.width, 0.2));
      card.animate(
        [
          { transform: 'none', opacity: 1, borderRadius: '16px' },
          { transform: `translate(${dx * 0.35}px, ${dy * 0.2 - 24}px) scale(.7)`, opacity: 1, offset: 0.35 },
          { transform: `translate(${dx}px, ${dy}px) scale(${s})`, opacity: 0.15, borderRadius: '999px' },
        ],
        { duration: 620, easing: 'cubic-bezier(.5,0,.75,0)', fill: 'forwards' },
      ).onfinish = finish;
    },
    [ch],
  );

  // Tapping anywhere outside the card tucks it away too.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) dock('outside');
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && dock('escape');
    const t = window.setTimeout(() => document.addEventListener('pointerdown', onDown, true), 400);
    document.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, dock]);

  if (!open || !ch) return null;
  const spots =
    ch.status !== 'open'
      ? 'Player sign-ups closed · come watch'
      : ch.spotsLeft === 0
        ? `All ${ch.capacity} player spots taken · waitlist open`
        : `${ch.spotsLeft} of ${ch.capacity} player spots left`;

  return (
    <div
      ref={cardRef}
      role="region"
      aria-label="Upcoming challenge"
      className="fixed inset-x-3 bottom-[calc(var(--bottom-nav-height)+env(safe-area-inset-bottom)+12px)] z-nav mx-auto max-w-md rounded-2xl border border-[#5A2A26] bg-[#1A1114] p-4 text-[#F4F1EC] shadow-overlay md:inset-x-auto md:bottom-6 md:right-6 md:w-[380px]"
      style={{ opacity: 0 }}
    >
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-[#D0463C] text-white">
          <Swords className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#E8675D]">
            <span className="mr-1.5 rounded bg-[#F2C94C] px-1.5 py-px text-[10px] text-[#1A1114]">NEW</span>
            Free challenge · {ch.game}
          </p>
          <p className="mt-1 font-heading text-body-emphasis font-bold leading-snug">{ch.title}</p>
          <p className="text-caption text-[#A3A6B1]">
            {challengeDay(ch.startsAt)}, {challengeTimeRange(ch.startsAt, ch.endsAt)} · {ch.cafe.name}
          </p>
          <p className="mt-1 text-caption font-semibold text-[#F2C94C]">{spots}</p>
          <p className="text-caption text-[#DADCE3]">
            Anyone can come to watch{ch.visitorOffer ? ` · ${ch.visitorOffer}` : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={() => dock('close')}
          aria-label="Close"
          className="-mr-1 -mt-1 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-[#A3A6B1] hover:bg-white/10 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-3 flex gap-2">
        <Link
          href={`/challenge/${ch.slug}`}
          onClick={() => {
            trackAction('challenge_teaser_click', { challenge: ch.slug, where: 'popup' });
            markChallengeSeen(ch.slug);
          }}
          className="flex h-11 flex-1 items-center justify-center rounded-xl bg-[#D0463C] text-sm font-semibold text-white hover:bg-[#E8675D]"
        >
          See the challenge
        </Link>
        <a
          href={COMMUNITY_URL}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => trackAction('community_join_tap', { where: 'popup' })}
          className="flex h-11 items-center justify-center gap-1.5 rounded-xl border border-[#3B6B4A] px-3 text-sm font-semibold text-[#7FE0A0] hover:bg-[#13221A]"
        >
          <MessageCircle className="h-4 w-4" aria-hidden /> WhatsApp
        </a>
      </div>
    </div>
  );
}
