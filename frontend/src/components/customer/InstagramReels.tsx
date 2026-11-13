'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, Play } from 'lucide-react';
import { INSTAGRAM_PATH } from '@/components/layout/SocialLinks';
import { trackAction } from '@/lib/api/analyticsEvents';
import { INSTAGRAM_HANDLE, INSTAGRAM_PROFILE, getInstagramReels, type InstagramReel } from '@/lib/api/instagram';
import { optimizedImg, fallBackToOriginal } from '@/lib/imageUrl';
import { cn } from '@/lib/cn';

/** Instagram's own gradient, used only for the ring and the follow button so it reads as "Instagram" at a glance. */
const IG_GRADIENT = 'bg-[linear-gradient(45deg,#FEDA75_0%,#FA7E1E_25%,#D62976_50%,#962FBF_75%,#4F5BD5_100%)]';
const NEW_DAYS = 7;

function IgMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d={INSTAGRAM_PATH} />
    </svg>
  );
}

/** The Reels glyph: a clapper with a play triangle. */
function ReelsMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinejoin="round" aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <path d="M3 8.5h18M8.5 3l2.6 5.5M14.5 3l2.6 5.5" />
      <path d="M10.2 12.2v5l4.3-2.5z" fill="currentColor" stroke="none" />
    </svg>
  );
}

const isNew = (r: InstagramReel) => Boolean(r.createdAt) && Date.now() - new Date(r.createdAt as string).getTime() < NEW_DAYS * 864e5;

/**
 * "KHEL-O on Instagram": who we are on Instagram, one follow button, and our latest reels.
 * Shown on Explore and Community. With no reels yet it is just the follow card.
 */
export function InstagramReels({ where, className }: { where: 'explore' | 'community'; className?: string }) {
  const { data } = useQuery({ queryKey: ['instagram-reels'], queryFn: getInstagramReels, staleTime: 300_000, retry: false });
  const reels = data?.reels ?? [];
  const handle = data?.handle ?? INSTAGRAM_HANDLE;
  const profile = handle === INSTAGRAM_HANDLE ? INSTAGRAM_PROFILE : `https://www.instagram.com/${handle}/`;
  const follow = () => trackAction('instagram_follow_tap', { where });

  return (
    <section aria-labelledby={`ig-${where}`} className={cn('flex flex-col gap-3', className)}>
      {/* Who this is: our profile, the way it looks on Instagram. */}
      <div className="flex items-center gap-3">
        <a
          href={profile}
          target="_blank"
          rel="noopener noreferrer"
          onClick={follow}
          aria-label={`KHEL-O on Instagram, @${handle}`}
          className={cn('flex h-[52px] w-[52px] flex-shrink-0 items-center justify-center rounded-full p-[2.5px]', IG_GRADIENT)}
        >
          <span className="flex h-full w-full items-center justify-center rounded-full bg-background p-[2px]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/icon-192x192.png" alt="" className="h-full w-full rounded-full object-cover" />
          </span>
        </a>
        <div className="min-w-0 flex-1">
          <h2 id={`ig-${where}`} className="font-heading text-h3 font-bold leading-tight text-text-primary">This is us on Instagram</h2>
          <p className="flex items-center gap-1 truncate text-caption text-text-secondary">
            <IgMark className="h-3.5 w-3.5 flex-shrink-0" />
            <span className="font-semibold text-text-primary">@{handle}</span>
            <span aria-hidden className="hidden sm:inline">·</span>
            <span className="hidden truncate sm:inline">what we build, drops, café news</span>
          </p>
        </div>
        {reels.length > 0 && <a
          href={profile}
          target="_blank"
          rel="noopener noreferrer"
          onClick={follow}
          className={cn('inline-flex min-h-[40px] flex-shrink-0 items-center gap-1.5 rounded-full px-3.5 text-caption font-extrabold text-white shadow-sm transition-transform active:scale-[0.97] sm:px-4', IG_GRADIENT)}
        >
          <IgMark className="h-4 w-4" /> Follow
        </a>}
      </div>

      {/* Our reels, newest first. Each opens on Instagram.
          Built only once the list has loaded: if the end card rendered first, the
          scroll snap would keep it in view and the strip would open at the end. */}
      {!data ? (
        <div className="-mx-4 flex gap-3 overflow-hidden px-4 pb-1" aria-hidden>
          {[0, 1, 2].map((n) => <div key={n} className="aspect-[9/16] w-[38%] max-w-[176px] flex-none animate-pulse rounded-2xl bg-border/50 sm:w-[168px]" />)}
        </div>
      ) : (
      <div className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none]" aria-label="Our latest reels">
        {reels.map((r, i) => (
          <a
            key={r.id}
            href={r.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => trackAction('instagram_reel_tap', { where, reel: r.id, at: i })}
            aria-label={`Watch on Instagram: ${r.title}`}
            className={cn(
              'group relative aspect-[9/16] w-[38%] max-w-[176px] flex-none snap-start overflow-hidden rounded-2xl shadow-card sm:w-[168px]',
              isNew(r) ? cn('p-[2.5px]', IG_GRADIENT) : 'bg-secondary',
            )}
          >
            <span className="relative block h-full w-full overflow-hidden rounded-[14px] bg-secondary">
              {r.coverUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  {...optimizedImg(r.coverUrl, '176px', { maxWidth: 400 })}
                  onError={fallBackToOriginal(r.coverUrl)}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04]"
                />
              ) : (
                // No cover: a poster made of the title itself.
                <span className="absolute inset-0 flex items-start bg-[radial-gradient(120%_80%_at_20%_0%,#3a1c2b_0%,#151017_60%)] p-3 pt-10">
                  <span className="font-heading text-[19px] font-bold leading-[1.1] text-white [text-wrap:balance]">{r.title}</span>
                </span>
              )}
              <span className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-black/35" />
              <span className="absolute left-2 right-2 top-2 flex items-center justify-between gap-1">
                {r.tag ? (
                  <span className="truncate rounded-full bg-white/20 px-2 py-0.5 text-[10.5px] font-extrabold uppercase tracking-wide text-white backdrop-blur">{r.tag}</span>
                ) : <span />}
                <ReelsMark className="h-[18px] w-[18px] flex-shrink-0 text-white drop-shadow" />
              </span>
              <span className={cn('absolute left-1/2 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center', r.coverUrl ? 'top-1/2' : 'top-[72%]', 'justify-center rounded-full bg-black/40 text-white backdrop-blur transition-transform duration-200 group-hover:scale-110')}>
                <Play className="ml-0.5 h-5 w-5 fill-current" aria-hidden />
              </span>
              <span className="absolute inset-x-0 bottom-0 flex flex-col gap-1 p-2.5 text-left">
                {isNew(r) && <span className="self-start rounded-md bg-white px-1.5 py-px text-[10px] font-black uppercase tracking-wider text-[#D62976]">New</span>}
                {r.coverUrl && <span className="line-clamp-3 text-[13px] font-bold leading-snug text-white">{r.title}</span>}
              </span>
            </span>
          </a>
        ))}

        {/* The last card: everything else is on our profile. */}
        <a
          href={profile}
          target="_blank"
          rel="noopener noreferrer"
          onClick={follow}
          className={cn(
            'relative flex flex-none snap-start flex-col justify-between overflow-hidden rounded-2xl p-3 text-white shadow-card',
            reels.length > 0 ? 'aspect-[9/16] w-[38%] max-w-[176px] sm:w-[168px]' : 'min-h-[120px] w-full',
            IG_GRADIENT,
          )}
        >
          <IgMark className="h-7 w-7" />
          <span className="flex flex-col gap-1.5">
            <span className="font-heading text-[17px] font-bold leading-tight">
              {reels.length > 0 ? 'See every reel on our page' : 'Follow the KHEL-O journey'}
            </span>
            <span className="text-caption font-semibold text-white/90">@{handle}</span>
            <span className="mt-1 inline-flex min-h-[36px] items-center gap-1 self-start rounded-full bg-white px-3.5 text-caption font-extrabold text-[#1c1c1e]">
              Follow <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
            </span>
          </span>
        </a>
      </div>
      )}
    </section>
  );
}
