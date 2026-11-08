'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, MessageCircle } from 'lucide-react';
import { cn } from '@/lib/cn';
import { listDrops, type DropListItem } from '@/lib/api/drops';
import { getChallenge, type Challenge } from '@/lib/api/challenges';
import { getThisWeek, markJoined } from '@/lib/api/community';
import { trackAction } from '@/lib/api/analyticsEvents';
import { COMMUNITY_URL, FEATURED_CHALLENGE_SLUG, challengeDay, isUpcoming, openToAll } from '@/lib/challenge';
import { useAuthStore } from '@/store/authStore';
import { useHomeBadges, type BadgeTab } from '@/lib/homeBadges';
import { RedBadge } from '@/components/customer/RedBadge';
import { PhoneCaptureCard } from '@/components/layout/PhoneNumberPrompt';

export type HomeTab = 'cafes' | 'drops' | 'challenges' | 'community';

const TABS: { key: HomeTab; label: string; badge?: BadgeTab }[] = [
  { key: 'cafes', label: 'Cafés' },
  { key: 'drops', label: 'Drops', badge: 'drops' },
  { key: 'challenges', label: 'Challenges', badge: 'challenges' },
  { key: 'community', label: 'Community', badge: 'community' },
];

/** Cafés | Drops | Challenges | Community, with the red numbers. The tab you
 *  are on never shows its own number: opening a tab clears it. */
export function HomeTabRow({ tab, onTab, joinPill }: { tab: HomeTab; onTab: (t: HomeTab) => void; joinPill?: React.ReactNode }) {
  const { counts, markSeen } = useHomeBadges();

  // Being on a tab is what clears its number.
  useEffect(() => {
    const b = TABS.find((t) => t.key === tab)?.badge;
    if (b) markSeen(b);
  }, [tab, markSeen]);

  return (
    <div className="flex items-center gap-2 border-b border-border">
      <div role="tablist" aria-label="Home sections" className="-mb-px flex min-w-0 flex-1 overflow-x-auto scrollbar-hide">
        {TABS.map((t) => {
          const on = t.key === tab;
          const n = t.badge && !on ? counts[t.badge] : 0;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              id={`home-tab-${t.key}`}
              aria-selected={on}
              aria-controls="home-panel"
              onClick={() => onTab(t.key)}
              className={cn(
                'relative inline-flex flex-none items-center gap-1 px-2 pb-2.5 pt-2 text-[13px] transition-colors md:gap-1.5 md:px-4 md:text-body',
                on ? 'font-extrabold text-text-primary' : 'font-semibold text-text-secondary hover:text-text-primary',
              )}
            >
              {t.label}
              {n > 0 && <RedBadge dot />}
              {on && <span className="absolute inset-x-2 bottom-0 h-[3px] rounded-full bg-primary" />}
            </button>
          );
        })}
      </div>
      {joinPill}
    </div>
  );
}

// ------------------------------------------------------------------ Drops

const STATE_LABEL: Record<string, { text: string; cls: string }> = {
  early: { text: 'Live · early access', cls: 'text-error' },
  open: { text: 'Open to everyone', cls: 'text-success' },
  soon: { text: 'Coming soon', cls: 'text-secondary' },
};

function dropWhen(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
}

function DropCard({ d }: { d: DropListItem }) {
  const meta = STATE_LABEL[d.state] ?? STATE_LABEL.soon;
  const soon = d.state === 'soon';
  return (
    <Link
      href={`/drops/${d.slug}`}
      className="flex gap-3 rounded-2xl border border-border bg-card p-3 shadow-card transition hover:border-primary/40 md:flex-col"
    >
      <div
        className="h-[88px] w-[88px] flex-none overflow-hidden rounded-xl bg-gradient-to-br from-[#5B1A2A] to-[#D0463C] md:h-36 md:w-full"
        style={d.coverImageUrl ? { backgroundImage: `url(${d.coverImageUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
        aria-hidden
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <p className={cn('text-[10.5px] font-extrabold uppercase tracking-wider', meta.cls)}>{meta.text}</p>
        <h3 className="font-heading text-body-emphasis font-bold text-text-primary">{d.title}</h3>
        <p className="truncate text-caption text-text-secondary">
          {d.cafe.name} · {dropWhen(d.nextStartsAt)}
        </p>
        <div className="mt-auto flex items-center justify-between gap-2 pt-2">
          <span className="text-caption font-bold text-error">{soon ? 'Not open yet' : `${d.seatsLeft} of ${d.seatsTotal} left`}</span>
          <span className="rounded-full bg-primary px-3.5 py-1.5 text-caption font-bold text-white">
            {d.iHold ? 'You are in' : soon ? 'Tell me' : 'Reserve'}
          </span>
        </div>
      </div>
    </Link>
  );
}

export function DropsPanel() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['home-drops'], queryFn: listDrops, staleTime: 60_000, retry: false });
  const needPhone = isAuthenticated && user && !user.phoneNumber;

  return (
    <div className="flex flex-col gap-3">
      {needPhone && <PhoneCaptureCard where="drops_tab" />}
      {isLoading && <div className="h-28 animate-pulse rounded-2xl bg-border/50" aria-label="Loading drops" />}
      {isError && (
        <div className="rounded-2xl border border-border bg-card p-4 text-center">
          <p className="text-body text-text-secondary">Could not load drops.</p>
          <button type="button" onClick={() => refetch()} className="mt-2 text-caption font-bold text-primary">Try again</button>
        </div>
      )}
      {data && data.length === 0 && (
        <div className="rounded-2xl border border-border bg-card p-5 text-center">
          <p className="font-heading text-body-emphasis font-bold text-text-primary">No drops open right now</p>
          <p className="mt-1 text-caption text-text-secondary">The next one goes to the community first.</p>
          <Link href="/community" className="mt-3 inline-flex min-h-[40px] items-center gap-1.5 rounded-full bg-primary px-4 text-caption font-bold text-white">
            Hear about it first <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      )}
      {data && data.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {data.map((d) => (
            <DropCard key={d.id} d={d} />
          ))}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------- Challenges

function ChallengeCard({ c }: { c: Challenge }) {
  const upcoming = isUpcoming(c);
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-4 shadow-card">
      <p className={cn('text-[10.5px] font-extrabold uppercase tracking-wider', upcoming ? 'text-error' : 'text-text-secondary')}>
        {upcoming ? 'Next challenge' : 'Last challenge'}
      </p>
      <h3 className="font-heading text-h3 font-bold text-text-primary">{c.title}</h3>
      <p className="text-caption text-text-secondary">
        {c.cafe.name} · {challengeDay(c.startsAt)} · {upcoming ? (openToAll(c.capacity) ? 'Free to play' : `${c.spotsLeft} of ${c.capacity} spots left`) : `${c.confirmed} players`}
      </p>
      <div className="mt-1 flex flex-wrap gap-2">
        {upcoming ? (
          <Link
            href={`/challenge/${c.slug}?join=1`}
            onClick={() => trackAction('challenge_teaser_click', { challenge: c.slug, where: 'home_tab' })}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full bg-primary px-5 text-caption font-bold text-white"
          >
            Sign up to play <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        ) : (
          <Link href="/community" className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full bg-primary px-5 text-caption font-bold text-white">
            See the photos and results <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        )}
        <Link href={`/challenge/${c.slug}`} className="inline-flex min-h-[44px] items-center rounded-full border border-border px-4 text-caption font-bold text-text-primary">
          Details
        </Link>
      </div>
    </div>
  );
}

export function ChallengesPanel() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['challenges', FEATURED_CHALLENGE_SLUG],
    queryFn: () => getChallenge(FEATURED_CHALLENGE_SLUG),
    staleTime: 60_000,
    retry: false,
  });
  return (
    <div className="flex flex-col gap-3">
      {isLoading && <div className="h-28 animate-pulse rounded-2xl bg-border/50" aria-label="Loading challenges" />}
      {isError && <p className="rounded-2xl border border-border bg-card p-4 text-center text-body text-text-secondary">Could not load challenges.</p>}
      {data && <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3"><ChallengeCard c={data} /></div>}
      {data && !isUpcoming(data) && (
        <p className="text-caption text-text-secondary">
          #02 is not announced yet. <Link href="/community" className="font-bold text-primary">The community hears first.</Link>
        </p>
      )}
    </div>
  );
}

// -------------------------------------------------------------- Community

export function CommunityPanel() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const { data } = useQuery({ queryKey: ['community-week', isAuthenticated], queryFn: getThisWeek, staleTime: 60_000, retry: false });
  const poll = data?.poll;
  const top = poll ? [...poll.options].sort((a, b) => b.votes - a.votes)[0] : null;
  const onJoin = () => {
    trackAction('community_join_tap', { where: 'home_tab' });
    if (isAuthenticated) markJoined().catch(() => undefined);
    try {
      localStorage.setItem('khelo_community_tapped', '1');
    } catch {
      /* ignore */
    }
  };
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <div className="flex flex-col gap-3 rounded-2xl border border-[#3B6B4A] bg-[#13221A] p-4 text-[#F4F1EC]">
        <p className="font-heading text-body-emphasis font-bold">The KHEL-O community</p>
        <p className="text-caption text-[#C9CBD3]">New drops and challenges land here first. Free, leave any time.</p>
        <a
          href={COMMUNITY_URL}
          target="_blank"
          rel="noopener noreferrer"
          onClick={onJoin}
          className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-[#25D366] px-4 font-bold text-[#06210F]"
        >
          <MessageCircle className="h-4 w-4" aria-hidden /> Join the WhatsApp group
        </a>
      </div>
      <Link href="/community" className="flex flex-col gap-1 rounded-2xl border border-border bg-card p-4 shadow-card">
        <p className="text-[10.5px] font-extrabold uppercase tracking-wider text-error">This week</p>
        <p className="font-heading text-body-emphasis font-bold text-text-primary">{poll ? poll.question : 'Open the community page'}</p>
        <p className="text-caption text-text-secondary">
          {poll && poll.total > 0 && top ? `${top.label} leads with ${top.percent}% · ${poll.total} votes` : 'Vote, get the members-only code, and help us build KHEL-O.'}
        </p>
        <span className="mt-2 inline-flex items-center gap-1 text-caption font-bold text-primary">
          Open community <ArrowRight className="h-4 w-4" aria-hidden />
        </span>
      </Link>
    </div>
  );
}
