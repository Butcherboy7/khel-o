'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Flame, Gamepad2, MapPin, MessageCircle, Monitor, Swords, Trophy, Users } from 'lucide-react';
import { SearchBarWithSuggestions } from '@/components/customer/SearchBarWithSuggestions';
import { dropArt } from '@/components/customer/HomeTabs';
import { listDrops } from '@/lib/api/drops';
import { getChallenge } from '@/lib/api/challenges';
import { getThisWeek } from '@/lib/api/community';
import { listBookings } from '@/lib/api/bookings';
import { listActivities, cafePath } from '@/lib/api/cafes';
import { FEATURED_CHALLENGE_SLUG, isUpcoming } from '@/lib/challenge';
import { trackAction } from '@/lib/api/analyticsEvents';
import { useAuthStore } from '@/store/authStore';
import type { CafeListItem } from '@/types';

const RECENT_KEY = 'khelo.explore.recent';

/** What people usually look for. Each chip goes straight there. */
const POPULAR: { label: string; href: string }[] = [
  { label: 'GTA 6', href: '/gta6' },
  { label: 'Challenges', href: '/challenge/tekken-01' },
  { label: 'Tekken', href: '/challenge/tekken-01' },
  { label: 'PS5', href: '/?activity=console' },
  { label: 'Snooker', href: '/?activity=snooker' },
];

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

function readRecent(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, 6) : [];
  } catch {
    return [];
  }
}

function saveRecent(q: string) {
  const t = q.trim();
  if (t.length < 3) return;
  try {
    const next = [t, ...readRecent().filter((x) => x.toLowerCase() !== t.toLowerCase())].slice(0, 6);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* private window: skip */
  }
}

/** Instagram-style Explore: one search on top, what is happening as big
 *  picture tiles, browse by game, then every café as a photo grid. */
export function ExploreHub({ cafes, cities }: { cafes: CafeListItem[]; cities: string[] }) {
  const router = useRouter();
  const storeAuth = useAuthStore((s) => s.isAuthenticated);
  // The saved sign-in is only known in the browser; wait for it so the first paint matches the server.
  const [mounted, setMounted] = useState(false);
  const isAuthenticated = mounted && storeAuth;
  const [q, setQ] = useState('');
  const [recent, setRecent] = useState<string[]>([]);
  useEffect(() => {
    setMounted(true);
    setRecent(readRecent());
  }, []);

  const { data: drops } = useQuery({ queryKey: ['home-drops'], queryFn: listDrops, staleTime: 60_000, retry: false });
  const { data: challenge } = useQuery({ queryKey: ['challenges', FEATURED_CHALLENGE_SLUG], queryFn: () => getChallenge(FEATURED_CHALLENGE_SLUG), staleTime: 60_000, retry: false });
  const { data: week } = useQuery({ queryKey: ['community-week', isAuthenticated], queryFn: getThisWeek, staleTime: 60_000, retry: false });
  const { data: activities = [] } = useQuery({ queryKey: ['activities', 'all'], queryFn: () => listActivities(), staleTime: 300_000, retry: false });
  const { data: myBookings } = useQuery({
    queryKey: ['explore', 'my-bookings'],
    queryFn: () => listBookings({ limit: 20 } as never),
    enabled: isAuthenticated,
    staleTime: 60_000,
    retry: false,
  });

  const liveDrop = useMemo(() => {
    const live = (drops ?? []).filter((x) => x.state === 'open' || x.state === 'early');
    return live.find((x) => /gta\s*6/i.test(x.game)) ?? live[0] ?? null;
  }, [drops]);

  const yourCafes = useMemo(() => {
    const ids = Array.from(new Set((myBookings?.items ?? []).map((b) => b.cafeId)));
    return ids.map((id) => cafes.find((c) => c.id === id)).filter((c): c is CafeListItem => Boolean(c)).slice(0, 6);
  }, [myBookings, cafes]);

  const shown = useMemo(() => {
    const t = norm(q);
    if (!t) return cafes;
    return cafes.filter((c) => norm(`${c.name} ${c.addressLine2 ?? ''} ${c.city}`).includes(t));
  }, [cafes, q]);

  const members = week?.members ?? 0;
  const challengeUpcoming = challenge ? isUpcoming(challenge) : false;

  return (
    <div className="flex flex-col gap-6">
      {/* Search: the one thing at the top. */}
      <div className="sticky top-0 z-30 -mx-4 -mt-3 bg-background/95 px-4 pb-2 pt-2 backdrop-blur">
        <div className="relative flex h-[52px] items-center rounded-full border border-border bg-card px-4 shadow-card focus-within:border-primary">
          <SearchBarWithSuggestions
            value={q}
            onChange={setQ}
            onSelectCity={(c) => {
              saveRecent(c);
              router.push(`/?city=${encodeURIComponent(c)}`);
            }}
            onSelectTag={(key) => router.push(`/?activity=${encodeURIComponent(key)}`)}
            cities={cities}
            activities={activities}
          />
        </div>
        <div className="-mx-4 mt-2.5 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]" aria-label="Popular searches">
          {POPULAR.map((p) => (
            <Link
              key={p.label}
              href={p.href}
              onClick={() => trackAction('explore_chip_tap', { chip: p.label })}
              className="inline-flex min-h-[40px] flex-none items-center rounded-full border border-border bg-card px-4 text-caption font-bold text-text-primary transition-colors hover:border-primary/50"
            >
              {p.label}
            </Link>
          ))}
        </div>
      </div>

      {isAuthenticated && !q && (recent.length > 0 || yourCafes.length > 0) && (
        <section className="flex flex-col gap-3" aria-label="For you">
          {recent.length > 0 && (
            <div>
              <h2 className="mb-2 font-heading text-body-emphasis font-bold text-text-primary">Recent</h2>
              <div className="flex flex-wrap gap-2">
                {recent.map((r) => (
                  <button key={r} type="button" onClick={() => setQ(r)} className="inline-flex min-h-[40px] items-center rounded-full bg-surface px-3.5 text-caption font-semibold text-text-primary">
                    {r}
                  </button>
                ))}
              </div>
            </div>
          )}
          {yourCafes.length > 0 && (
            <div>
              <h2 className="mb-2 font-heading text-body-emphasis font-bold text-text-primary">Your cafés</h2>
              <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
                {yourCafes.map((c) => (
                  <CafeTile key={c.id} c={c} className="w-[44%] max-w-[200px] flex-none sm:w-[200px]" />
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {!q && (
        <section className="flex flex-col gap-3" aria-label="Happening now">
          <h2 className="font-heading text-h3 font-bold text-text-primary">Happening now</h2>
          <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] lg:mx-0 lg:grid lg:grid-cols-3 lg:gap-4 lg:overflow-visible lg:px-0 xl:grid-cols-4">
            {drops === undefined && (
              <div className="aspect-[4/5] w-[72%] max-w-[300px] flex-none lg:w-auto lg:max-w-none animate-pulse snap-start rounded-3xl bg-border/50 sm:w-[280px] lg:w-auto" aria-hidden />
            )}
            {liveDrop && (
              <Link
                href={`/drops/${liveDrop.slug}`}
                onClick={() => trackAction('explore_happening_tap', { what: 'drop' })}
                className="relative aspect-[4/5] w-[72%] max-w-[300px] flex-none lg:w-auto lg:max-w-none snap-start overflow-hidden rounded-3xl bg-gradient-to-br from-[#5B1A2A] to-[#D0463C] shadow-card sm:w-[280px] lg:w-auto"
              >
                {dropArt(liveDrop) && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={dropArt(liveDrop) as string} alt="" className="absolute inset-0 h-full w-full object-cover" />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
                <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-primary px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wide text-white">
                  <Flame className="h-3 w-3" aria-hidden /> Live
                </span>
                <div className="absolute inset-x-0 bottom-0 p-3.5 text-white">
                  <p className="font-heading text-h3 font-bold leading-tight">{liveDrop.game} at {liveDrop.cafe.name}</p>
                  <p className="mt-0.5 text-caption text-white/80">
                    {liveDrop.seatsPerSlot ? `${liveDrop.seatsPerSlot} seats a night` : `${liveDrop.seatsLeft} of ${liveDrop.seatsTotal} seats left`}
                  </p>
                  <span className="mt-2.5 inline-flex min-h-[40px] items-center rounded-full bg-white px-4 text-caption font-extrabold text-[#1c1c1e]">Reserve</span>
                </div>
              </Link>
            )}
            <Link
              href={`/challenge/${FEATURED_CHALLENGE_SLUG}`}
              onClick={() => trackAction('explore_happening_tap', { what: 'challenge' })}
              className="relative aspect-[4/5] w-[72%] max-w-[300px] flex-none lg:w-auto lg:max-w-none snap-start overflow-hidden rounded-3xl bg-[#0b0708] shadow-card sm:w-[280px] lg:w-auto"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/community/full-house.webp" alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
              <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wide text-white backdrop-blur">
                {challengeUpcoming ? <Swords className="h-3 w-3" aria-hidden /> : <Trophy className="h-3 w-3" aria-hidden />}
                {challengeUpcoming ? 'Next challenge' : 'Last challenge'}
              </span>
              <div className="absolute inset-x-0 bottom-0 p-3.5 text-white">
                <p className="font-heading text-h3 font-bold leading-tight">{challenge?.title ?? 'Tekken Challenge #01'}</p>
                <p className="mt-0.5 text-caption text-white/80">{challengeUpcoming ? 'Free to enter' : 'See the photos and who won'}</p>
                <span className="mt-2.5 inline-flex min-h-[40px] items-center rounded-full bg-white px-4 text-caption font-extrabold text-[#1c1c1e]">
                  {challengeUpcoming ? 'Sign up' : 'See recap'}
                </span>
              </div>
            </Link>
            <Link
              href="/community"
              onClick={() => trackAction('explore_happening_tap', { what: 'community' })}
              className="relative aspect-[4/5] w-[72%] max-w-[300px] flex-none lg:w-auto lg:max-w-none snap-start overflow-hidden rounded-3xl bg-[#13221A] shadow-card sm:w-[280px] lg:w-auto"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/community/the-crowd.webp" alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
              <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-[#25D366] px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wide text-[#06210F]">
                <Users className="h-3 w-3" aria-hidden /> Community
              </span>
              <div className="absolute inset-x-0 bottom-0 p-3.5 text-white">
                <p className="font-heading text-h3 font-bold leading-tight">{members >= 10 ? `${members} gamers are in` : 'Play with people, not alone'}</p>
                <p className="mt-0.5 text-caption text-white/80">New drops and challenges land here first</p>
                <span className="mt-2.5 inline-flex min-h-[40px] items-center gap-1.5 rounded-full bg-[#25D366] px-4 text-caption font-extrabold text-[#06210F]">
                  <MessageCircle className="h-4 w-4" aria-hidden /> Join
                </span>
              </div>
            </Link>
          </div>
        </section>
      )}

      {!q && activities.length > 0 && (
        <section className="flex flex-col gap-3" aria-label="Browse by game">
          <h2 className="font-heading text-h3 font-bold text-text-primary">Browse by game</h2>
          <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-5 lg:grid-cols-9">
            {activities.slice(0, 9).map((a) => (
              <Link
                key={a.key}
                href={`/?activity=${encodeURIComponent(a.key)}`}
                onClick={() => trackAction('explore_activity_tap', { activity: a.key })}
                className="flex min-h-[88px] flex-col items-center justify-center gap-1.5 rounded-2xl border border-border bg-card px-1 py-3 text-center text-caption font-bold text-text-primary shadow-card transition-colors hover:border-primary/50"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  {/pc|computer/.test(a.key) ? <Monitor className="h-[18px] w-[18px]" aria-hidden /> : <Gamepad2 className="h-[18px] w-[18px]" aria-hidden />}
                </span>
                <span className="line-clamp-2">{a.label}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="flex flex-col gap-3" aria-label="Cafés">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="font-heading text-h3 font-bold text-text-primary">{q ? `Cafés for “${q.trim()}”` : 'Cafés'}</h2>
          <Link href="/" className="inline-flex items-center gap-1 text-caption font-bold text-primary">
            Filters and map view <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </div>
        {shown.length === 0 ? (
          <p className="rounded-2xl border border-border bg-card p-4 text-center text-body text-text-secondary">No café by that name yet. Try a city or a game.</p>
        ) : (
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 lg:gap-4 xl:grid-cols-5 2xl:grid-cols-6" onClick={() => q && saveRecent(q)}>
            {shown.map((c, i) => (
              <CafeTile key={c.id} c={c} tall={i % 5 === 0} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function CafeTile({ c, tall = false, className = '' }: { c: CafeListItem; tall?: boolean; className?: string }) {
  const photo = c.photos?.[0];
  return (
    <Link
      href={cafePath(c)}
      className={`group relative block overflow-hidden rounded-2xl bg-surface shadow-card ${tall ? 'row-span-2 aspect-[3/4]' : 'aspect-square'} ${className}`}
      style={photo?.color ? { backgroundColor: photo.color } : undefined}
    >
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photo.url} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-[#5B1A2A] to-[#D0463C]" aria-hidden />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
      {c.freeNow ? (
        <span className="absolute left-2 top-2 rounded-full bg-success px-2 py-0.5 text-[10.5px] font-extrabold text-white">{c.freeNow} free now</span>
      ) : c.isLeadListing ? (
        <span className="absolute left-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[10.5px] font-extrabold text-white backdrop-blur">Booking soon</span>
      ) : null}
      <div className="absolute inset-x-0 bottom-0 p-2.5 text-white">
        <p className="truncate font-heading text-body font-bold leading-tight">{c.name}</p>
        <p className="flex items-center gap-1 truncate text-[11.5px] text-white/80">
          <MapPin className="h-3 w-3 flex-none" aria-hidden /> {c.addressLine2 || c.city}
          {c.startingPrice ? ` · from ₹${Math.round(c.startingPrice)}` : ''}
        </p>
      </div>
    </Link>
  );
}
