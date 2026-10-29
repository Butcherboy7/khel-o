'use client';

import { useState } from 'react';
import { Play } from 'lucide-react';
import { fightFont } from '@/components/challenge/ChallengeHero';
import { trackAction } from '@/lib/api/analyticsEvents';

/** The id of a real YouTube video, or this placeholder while the edit is being made. */
export const VIDEO_PLACEHOLDER = 'PLACEHOLDER';
const YT_ID = /^[\w-]{11}$/;

export function isVideoId(v: string | null | undefined): v is string {
  return !!v && (v === VIDEO_PLACEHOLDER || YT_ID.test(v));
}

/**
 * "What is Tekken?" for people who have never played: a short edit of it on the
 * big screen at the café. Our own poster stands in until they tap, so no
 * YouTube script or cookie loads for people who don't press play (and the page
 * stays fast inside Instagram's browser). Tapping swaps in the player and
 * starts it. While the edit isn't ready, the card says so instead of showing a
 * broken player.
 */
export function ChallengeVideo({ slug, videoId, cafe }: { slug: string; videoId: string; cafe: string }) {
  const [playing, setPlaying] = useState(false);
  const isPlaceholder = videoId === VIDEO_PLACEHOLDER;

  const play = () => {
    trackAction('challenge_video_play', { challenge: slug, placeholder: isPlaceholder });
    setPlaying(true);
  };

  return (
    <section aria-label="See what Tekken looks like" className="mt-3">
      <p className="mb-2 text-sm font-semibold text-[#E9E2E5]">Never seen Tekken? Watch it on the big screen.</p>
      <div className="relative aspect-video w-full overflow-hidden border border-white/15 bg-black shadow-[0_14px_40px_rgba(0,0,0,0.55)]">
        {playing && !isPlaceholder ? (
          <iframe
            className="absolute inset-0 h-full w-full"
            src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0&playsinline=1&modestbranding=1`}
            title={`Tekken 8 on the big screen at ${cafe}`}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        ) : playing ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-[#14101A] px-6 text-center">
            <p className={`${fightFont.className} text-3xl font-bold uppercase text-[#F2C94C]`}>The edit is coming</p>
            <p className="text-sm text-[#C9C0C4]">A short video of Tekken 8 at {cafe} goes here.</p>
          </div>
        ) : (
          <button
            type="button"
            onClick={play}
            aria-label="Play the video: Tekken 8 on the big screen"
            className="group absolute inset-0 flex items-center justify-center overflow-hidden text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
          >
            {/* Our own poster art: stage glow, slash, big lettering */}
            <span className="absolute inset-0 bg-[radial-gradient(70%_90%_at_30%_30%,rgba(208,70,60,0.55),transparent),radial-gradient(60%_80%_at_90%_100%,rgba(92,34,150,0.5),transparent),#0E0A10]" aria-hidden />
            <span className="absolute -left-10 top-[58%] h-2.5 w-[130%] -rotate-[10deg] bg-[#D0463C]/80 shadow-[0_0_30px_rgba(208,70,60,0.7)]" aria-hidden />
            <span className={`${fightFont.className} absolute left-4 top-3 text-[13px] font-semibold uppercase tracking-[0.14em] text-white/80`} aria-hidden>
              {cafe}
            </span>
            <span className={`${fightFont.className} absolute bottom-3 left-4 right-4 text-[34px] font-bold uppercase leading-[0.9] text-white [text-shadow:0_4px_16px_rgba(0,0,0,0.8)]`}>
              Tekken 8<br />
              <span className="text-[#E8675D]">on the big screen</span>
            </span>
            <span className="cm-playpulse relative flex h-16 w-16 items-center justify-center rounded-full bg-[#F2C94C] text-[#1A1306] transition-transform group-hover:scale-110 group-active:scale-95">
              <Play className="ml-1 h-7 w-7 fill-current" aria-hidden />
            </span>
          </button>
        )}
      </div>
    </section>
  );
}
