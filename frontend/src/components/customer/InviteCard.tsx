'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, Link2, Users } from 'lucide-react';
import { WhatsAppIcon } from '@/components/icons/WhatsAppIcon';
import Link from 'next/link';
import { getMyReferrals, getReferralOffer } from '@/lib/api/referrals';
import { trackAction } from '@/lib/api/analyticsEvents';
import { createShare } from '@/lib/share';
import { useAuthStore } from '@/store/authStore';
import { cn } from '@/lib/cn';

/** The no-fee first booking ends 30 Nov 2026 (IST); after that the card stops promising it. */
const FREE_FEE_ENDS = Date.parse('2026-11-30T23:59:59+05:30');

/** Squad levels: shown, never paid. Each one needs friends who actually signed up. */
export function squadLevel(joined: number): { name: string; next: number | null } {
  if (joined >= 10) return { name: 'Squad legend', next: null };
  if (joined >= 3) return { name: 'Squad builder', next: 10 };
  if (joined >= 1) return { name: 'Squad starter', next: 3 };
  return { name: 'No squad yet', next: 1 };
}

/**
 * "Bring your squad": one tap to WhatsApp a tracked invite. Signed in, the
 * link carries the player's invite code, and the card shows how many friends
 * opened it, made an account and booked.
 */
export function InviteCard({ where, path = '/gta6/near-me', className }: { where: string; path?: string; className?: string }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const { data } = useQuery({ queryKey: ['me', 'referrals'], queryFn: getMyReferrals, enabled: isAuthenticated, staleTime: 60_000, retry: false });
  const { data: publicOffer } = useQuery({ queryKey: ['referral-offer'], queryFn: getReferralOffer, staleTime: 300_000, retry: false });
  const offer = data?.offer ?? publicOffer;
  // The friend's first booking: welcome + community code. The referrer: a reward per friend who plays.
  const friendGets = offer?.on ? offer.welcome + offer.community : 0;
  const youGet = offer?.on ? offer.reward : 0;
  const [copied, setCopied] = useState(false);
  const feeFree = Date.now() < FREE_FEE_ENDS;

  const message =
    friendGets > 0
      ? `GTA 6 is out. Book a PS5 at a café near you on KHEL-O. You get ₹${offer!.welcome} off your first booking${
          offer!.community > 0 ? `, and ₹${offer!.community} more with the code from the KHEL-O WhatsApp community` : ''
        } 👇`
      : feeFree
      ? 'GTA 6 is out. Book a PS5 at a café near you on KHEL-O. Your first booking has no booking fee till 30 Nov 👇'
      : 'GTA 6 is out. Book a PS5 at a café near you on KHEL-O, and let’s play 👇';
  const target = { path, context: 'invite' as const, campaign: `invite-${where}`, inv: data?.code };

  const whatsapp = () => {
    const url = createShare(target, 'whatsapp');
    trackAction('invite_tap', { where, channel: 'whatsapp' });
    window.open(`https://wa.me/?text=${encodeURIComponent(`${message}\n${url}`)}`, '_blank', 'noopener,noreferrer');
  };
  const copy = async () => {
    const url = createShare(target, 'copy');
    trackAction('invite_tap', { where, channel: 'copy' });
    try {
      await navigator.clipboard.writeText(`${message}\n${url}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt('Copy this link', url);
    }
  };

  const level = squadLevel(data?.joined ?? 0);
  return (
    <section className={cn('flex flex-col gap-3 rounded-2xl border border-border bg-card p-4', className)} aria-labelledby={`invite-${where}`}>
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary">
          <Users className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 id={`invite-${where}`} className="font-heading text-body-emphasis font-bold text-text-primary">Bring your squad</h2>
          <p className="text-caption text-text-secondary">
            {friendGets > 0 ? (
              <>
                Friends get up to <b className="text-text-primary">₹{friendGets} off</b> their first booking.
                {youGet > 0 && (
                  <>
                    {' '}You get <b className="text-text-primary">₹{youGet} off</b> your next one for each friend who plays.
                  </>
                )}
              </>
            ) : feeFree ? (
              'Send friends your link. Their first booking has no booking fee till 30 Nov.'
            ) : (
              'GTA 6 is better with friends. Send them your link.'
            )}
          </p>
        </div>
      </div>
      {isAuthenticated && data && data.available > 0 && (
        <p className="rounded-xl bg-success/10 px-3 py-2 text-caption font-semibold text-emerald-700">
          <span className="tabular-nums">₹{data.available}</span> off is waiting for your next booking. It comes off at checkout on its own.
        </p>
      )}
      {isAuthenticated && data && (data.opened > 0 || data.joined > 0) && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl bg-surface px-3 py-2 text-caption">
          <span className="font-semibold text-text-primary">{level.name}</span>
          <span className="tabular-nums text-text-secondary">{data.opened} opened</span>
          <span className="tabular-nums text-text-secondary">{data.joined} joined</span>
          <span className="tabular-nums text-text-secondary">{data.played} played</span>
          {level.next && <span className="text-text-secondary">{level.next - data.joined} more to the next level</span>}
        </div>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={whatsapp}
          className="btn-depth inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl bg-[#25D366] px-4 text-body font-bold text-[#0B1F12] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <WhatsAppIcon className="h-5 w-5" aria-hidden />
          Send on WhatsApp
        </button>
        <button
          type="button"
          onClick={copy}
          className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-border px-4 text-body font-semibold text-text-primary hover:border-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          aria-label="Copy invite link"
        >
          {copied ? <Check className="h-4 w-4 text-success" aria-hidden /> : <Link2 className="h-4 w-4" aria-hidden />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      {friendGets > 0 && (
        <p className="text-[11px] text-text-secondary">
          {!isAuthenticated && (
            <>
              <Link href="/login" className="font-semibold text-primary-dark hover:underline">Sign in</Link> to get your own link.{' '}
            </>
          )}
          Discounts on KHEL-O bookings only, never cash.{' '}
          <Link href="/referral-terms" className="font-semibold text-primary-dark hover:underline">How it works</Link>
        </p>
      )}
    </section>
  );
}
