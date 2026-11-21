'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/cn';
import { trackAction } from '@/lib/api/analyticsEvents';

/**
 * The one next step for a page that has nothing to book on it (a finished
 * challenge, About, Contact, 404, sign-in): GTA 6 at a café near you.
 * Taps are counted as `cta_tap` with the page they came from.
 */
export function PlayGta6Cta({ from, className, tone = 'light' }: { from: string; className?: string; tone?: 'light' | 'dark' }) {
  const dark = tone === 'dark';
  return (
    <Link
      href="/gta6/near-me"
      onClick={() => trackAction('cta_tap', { cta: 'play_gta6', from })}
      className={cn(
        'group flex items-center gap-3 rounded-2xl border p-4 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        dark ? 'border-white/15 bg-white/[0.06] text-white hover:border-white/35' : 'border-primary/30 bg-primary/[0.07] text-text-primary hover:border-primary/60',
        className,
      )}
    >
      <span className="min-w-0 flex-1">
        <span className={cn('block text-[10.5px] font-extrabold uppercase tracking-wider', dark ? 'text-[#FF7A6B]' : 'text-primary')}>GTA 6 is out now</span>
        <span className="block font-heading text-body-emphasis font-bold">Play it at a café near you</span>
        <span className={cn('block text-caption', dark ? 'text-white/70' : 'text-text-secondary')}>PS5 cafés with live prices. Book in a minute, walk in with a QR pass.</span>
      </span>
      <span className="inline-flex min-h-[44px] flex-none items-center gap-1.5 rounded-full bg-primary px-4 text-caption font-bold text-white">
        See cafés <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
      </span>
    </Link>
  );
}
