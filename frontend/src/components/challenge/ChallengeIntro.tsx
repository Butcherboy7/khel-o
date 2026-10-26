'use client';

import { useEffect, useState } from 'react';
import { trackAction } from '@/lib/api/analyticsEvents';
import { introCookie } from '@/lib/challenge';

const PLAY_MS = 2700;

/**
 * The reel's joke, finished: a wallet comes out, a hand stops it, it goes back
 * in the pocket, FREE is stamped on the screen. ~2.5 s, tap anywhere to skip.
 * Rendered on the server for visitors from an outside link, and animated in
 * pure CSS, so it plays before the page's JS has loaded.
 */
export function ChallengeIntro({ slug, caption }: { slug: string; caption: string }) {
  const [gone, setGone] = useState(false);

  useEffect(() => {
    try {
      document.cookie = `${introCookie(slug)}=1; path=/; max-age=${60 * 60 * 24 * 60}; samesite=lax`;
    } catch {
      /* cookies blocked: it may play again, which is harmless */
    }
    const t = setTimeout(() => {
      setGone(true);
      trackAction('challenge_intro', { challenge: slug, how: 'played' });
    }, PLAY_MS);
    return () => clearTimeout(t);
  }, [slug]);

  if (gone) return null;
  return (
    <div
      className="chi-overlay fixed inset-0 z-[70] flex cursor-pointer flex-col items-center justify-center overflow-hidden bg-[#0E0F13]"
      onClick={() => {
        setGone(true);
        trackAction('challenge_intro', { challenge: slug, how: 'skipped' });
      }}
      aria-hidden
    >
      <div className="chi-pair relative flex flex-col items-center">
        <span className="chi-hand relative z-10 -mb-8 text-[88px] leading-none drop-shadow-[0_8px_18px_rgba(0,0,0,0.6)]">✋</span>
        <Wallet />
      </div>
      <p className="chi-caption absolute bottom-[22%] px-6 text-center font-heading text-3xl font-bold text-[#F4F1EC]">{caption}</p>
      <div className="chi-stamp absolute rounded-2xl border-[6px] border-[#E8675D] px-7 py-2 font-heading text-[64px] font-black leading-none tracking-[0.08em] text-[#E8675D] [mix-blend-mode:screen]">
        FREE
      </div>
      <p className="absolute bottom-[max(env(safe-area-inset-bottom),20px)] text-xs text-[#6B6F7B]">Tap to skip</p>
    </div>
  );
}

function Wallet() {
  return (
    <svg className="chi-wallet" width="150" height="112" viewBox="0 0 150 112" aria-hidden>
      {/* a ₹ note peeking out */}
      <rect x="22" y="2" width="96" height="46" rx="5" fill="#3B6B4A" transform="rotate(-6 70 25)" />
      <text x="62" y="35" fill="#BFE8CB" fontSize="24" fontWeight="700" transform="rotate(-6 70 25)">
        ₹
      </text>
      <rect x="4" y="24" width="142" height="84" rx="14" fill="#6B4226" />
      <rect x="4" y="24" width="142" height="30" rx="14" fill="#7E5030" />
      <rect x="96" y="58" width="50" height="30" rx="8" fill="#55341E" />
      <circle cx="112" cy="73" r="5" fill="#C9A26B" />
    </svg>
  );
}
