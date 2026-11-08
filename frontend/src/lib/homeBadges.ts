'use client';

import { useCallback, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { listDrops } from '@/lib/api/drops';
import { getChallenge } from '@/lib/api/challenges';
import { getThisWeek } from '@/lib/api/community';
import { FEATURED_CHALLENGE_SLUG, isUpcoming } from '@/lib/challenge';
import { useAuthStore } from '@/store/authStore';

/**
 * The red numbers on the home tabs. A number means "something here you have
 * not opened yet". It clears when the tab is opened (not on a timer), and a
 * new drop / challenge / vote brings it back. What was seen is stored per
 * device, so logged-out visitors get the badges too.
 *
 * The dot on Me is separate: "finish setting up" (no phone number saved).
 */
export type BadgeTab = 'drops' | 'challenges' | 'community';

const KEY = 'khelo_seen_v1';
const SNOOZE_KEY = 'khelo_phone_snooze_until';
const EVENT = 'khelo:seen';
const SNOOZE_DAYS = 7;

type Seen = Record<BadgeTab, string[]>;
const EMPTY: Seen = { drops: [], challenges: [], community: [] };

function readSeen(): Seen {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return EMPTY;
    const v = JSON.parse(raw);
    return { drops: v.drops ?? [], challenges: v.challenges ?? [], community: v.community ?? [] };
  } catch {
    return EMPTY;
  }
}

function writeSeen(next: Seen) {
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* private mode: badges simply come back next visit */
  }
  window.dispatchEvent(new Event(EVENT));
}

export function isPhoneAskSnoozed(): boolean {
  try {
    return Number(localStorage.getItem(SNOOZE_KEY) || 0) > Date.now();
  } catch {
    return false;
  }
}

/** "Later" on the phone-number card hides the Me dot for a week. */
export function snoozePhoneAsk() {
  try {
    localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_DAYS * 86_400_000));
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(EVENT));
}

export interface HomeBadges {
  counts: Record<BadgeTab, number>;
  /** Logged in, no phone number, not snoozed. */
  meDot: boolean;
  /** Mark everything currently in this tab as seen. */
  markSeen: (tab: BadgeTab) => void;
}

export function useHomeBadges(): HomeBadges {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);
  const [seen, setSeen] = useState<Seen>(EMPTY);
  const [snooze, setSnooze] = useState(false);

  useEffect(() => {
    const sync = () => {
      setSeen(readSeen());
      setSnooze(isPhoneAskSnoozed());
    };
    sync();
    window.addEventListener(EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const { data: drops } = useQuery({ queryKey: ['home-drops'], queryFn: listDrops, staleTime: 60_000, retry: false });
  const { data: ch } = useQuery({
    queryKey: ['challenges', FEATURED_CHALLENGE_SLUG],
    queryFn: () => getChallenge(FEATURED_CHALLENGE_SLUG),
    staleTime: 60_000,
    retry: false,
  });
  const { data: week } = useQuery({ queryKey: ['community-week', isAuthenticated], queryFn: getThisWeek, staleTime: 60_000, retry: false });

  // What is in each tab right now, as stable tokens.
  const tokens: Record<BadgeTab, string[]> = {
    drops: (drops ?? []).filter((d) => !d.iHold).map((d) => d.id),
    challenges: ch ? [`${ch.slug}:${isUpcoming(ch) ? 'up' : ch.status}`] : [],
    community: week?.poll && !week.poll.closed ? [`poll:${week.poll.id}`] : [],
  };

  const counts: Record<BadgeTab, number> = {
    drops: tokens.drops.filter((t) => !seen.drops.includes(t)).length,
    challenges: tokens.challenges.filter((t) => !seen.challenges.includes(t)).length,
    community: tokens.community.filter((t) => !seen.community.includes(t)).length,
  };

  const markSeen = useCallback(
    (tab: BadgeTab) => {
      const current = readSeen();
      const merged = Array.from(new Set([...current[tab], ...tokens[tab]]));
      if (merged.length !== current[tab].length) writeSeen({ ...current, [tab]: merged });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(tokens)],
  );

  return { counts, meDot: Boolean(isAuthenticated && user && !user.phoneNumber && !snooze), markSeen };
}
