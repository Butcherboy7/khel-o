'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getChallenge, getMyActiveChallenges, type Challenge } from '@/lib/api/challenges';
import { FEATURED_CHALLENGE_SLUG, isUpcoming } from '@/lib/challenge';
import { useAuthStore } from '@/store/authStore';

/**
 * The upcoming-challenge pop-up and the "New" tag it leaves on Profile.
 *  - nothing stored: the pop-up may show (once per device)
 *  - 'docked': it was closed and tucked into Profile, so Profile and
 *    "My challenges" carry a New tag
 *  - 'seen': they opened the challenge or My challenges; no more nudges
 * Per device and per challenge, so the next challenge nudges again.
 */
export type NudgeState = 'docked' | 'seen' | null;
const EVENT = 'khelo:challenge-nudge';
const key = (slug: string) => `khelo_challenge_nudge_${slug}`;

export function readNudge(slug: string): NudgeState {
  try {
    const v = localStorage.getItem(key(slug));
    return v === 'docked' || v === 'seen' ? v : null;
  } catch {
    return 'seen'; // storage blocked: don't nag on every page
  }
}

export function writeNudge(slug: string, state: Exclude<NudgeState, null>): void {
  try {
    localStorage.setItem(key(slug), state);
  } catch {
    /* private mode: fine, it just won't remember */
  }
  window.dispatchEvent(new Event(EVENT));
}

export function markChallengeSeen(slug: string): void {
  if (readNudge(slug) !== 'seen') writeNudge(slug, 'seen');
}

function useNudgeState(slug: string): NudgeState | undefined {
  // undefined until mounted, so the server render never shows a tag.
  const [state, setState] = useState<NudgeState | undefined>(undefined);
  useEffect(() => {
    const sync = () => setState(readNudge(slug));
    sync();
    window.addEventListener(EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, [slug]);
  return state;
}

/** The featured challenge, if it's still ahead and this person isn't in it. */
export function useChallengeToNudge(): Challenge | null {
  // Nothing until after hydration: the nav fetches this early, so the data can
  // land before the page has hydrated, and the server HTML never has it.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const { data: ch } = useQuery({
    queryKey: ['challenges', FEATURED_CHALLENGE_SLUG],
    queryFn: () => getChallenge(FEATURED_CHALLENGE_SLUG),
    staleTime: 60_000,
    retry: false,
  });
  const { data: mine, isSuccess: mineLoaded } = useQuery({
    queryKey: ['challenges', 'mine', 'active'],
    queryFn: getMyActiveChallenges,
    enabled: isAuthenticated,
    staleTime: 60_000,
  });
  if (!mounted || !ch || !isUpcoming(ch)) return null;
  if (isAuthenticated && !mineLoaded) return null;
  if (mine?.some((c) => c.slug === ch.slug)) return null;
  return ch;
}

/** Pop-up state for the featured challenge: whether it may show, or the New tag is on. */
export function useChallengeNudge(): { challenge: Challenge | null; mayPopUp: boolean; showNew: boolean } {
  const challenge = useChallengeToNudge();
  const state = useNudgeState(FEATURED_CHALLENGE_SLUG);
  return {
    challenge,
    mayPopUp: !!challenge && state === null,
    showNew: !!challenge && state === 'docked',
  };
}
