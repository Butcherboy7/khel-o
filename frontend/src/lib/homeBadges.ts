'use client';

import { useCallback, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { listDrops } from '@/lib/api/drops';
import { getChallenge } from '@/lib/api/challenges';
import { FEATURED_CHALLENGE_SLUG, isUpcoming } from '@/lib/challenge';

/**
 * The red dot on a home tab: something you can act on now that you have not
 * opened yet (a drop open for booking, a challenge you can still join). Only
 * one tab shows it at a time, it clears when the tab is opened (not on a
 * timer), and the next new drop / challenge brings it back. Seen state is
 * per device. The bell keeps its number for real notifications; nothing else
 * is badged.
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
  /** Mark everything currently in this tab as seen. */
  markSeen: (tab: BadgeTab) => void;
}

export function useHomeBadges(): HomeBadges {
  const [seen, setSeen] = useState<Seen>(EMPTY);

  useEffect(() => {
    const sync = () => {
      setSeen(readSeen());
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

  // What is in each tab right now, as stable tokens.
  const tokens: Record<BadgeTab, string[]> = {
    // Only drops you can act on now: open or early access, seats left, not already yours.
    drops: (drops ?? []).filter((d) => !d.iHold && (d.state === 'open' || d.state === 'early') && d.seatsLeft > 0).map((d) => d.id),
    // Only a challenge you can still join. A finished one's recap is not an alert.
    challenges: ch && isUpcoming(ch) ? [`${ch.slug}:up`] : [],
    // The community is an invitation, not an alert: it never gets a badge.
    community: [],
  };

  // One signal at a time. Several red marks at once read as noise, so only the
  // first tab (in priority order) with something unseen shows a dot.
  const first = (['drops', 'challenges', 'community'] as BadgeTab[]).find((t) => tokens[t].some((x) => !seen[t].includes(x)));
  const counts: Record<BadgeTab, number> = { drops: 0, challenges: 0, community: 0 };
  if (first) counts[first] = 1;

  const markSeen = useCallback(
    (tab: BadgeTab) => {
      const current = readSeen();
      const merged = Array.from(new Set([...current[tab], ...tokens[tab]]));
      if (merged.length !== current[tab].length) writeSeen({ ...current, [tab]: merged });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(tokens)],
  );

  return { counts, markSeen };
}
