'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Ref } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { InAppBrowserNotice } from '@/components/auth/InAppBrowserNotice';
import { SpecialAccessBadge } from '@/components/customer/SpecialAccessBadge';
import { claimCampaignBadge, getCampaignPage, type CampaignClaim } from '@/lib/api/promotions';
import { normaliseCode, storeCampaign } from '@/lib/campaign';
import { useAuthStore } from '@/store/authStore';

const SEEN_KEY = 'khelo_welcome_seen_v1';
const CONFETTI = ['#E54D42', '#F59E0B', '#FFF1B8', '#8B5CF6', '#10B981'];

const rupees = (n: number) => `₹${Number.isInteger(n) ? n : n.toFixed(2)}`;

function wasSeen(code: string): boolean {
  try {
    return (JSON.parse(window.localStorage.getItem(SEEN_KEY) || '[]') as string[]).includes(code);
  } catch {
    return false;
  }
}
function markSeen(code: string) {
  try {
    const seen = JSON.parse(window.localStorage.getItem(SEEN_KEY) || '[]') as string[];
    window.localStorage.setItem(SEEN_KEY, JSON.stringify(Array.from(new Set([...seen, code]))));
  } catch {
    /* storage blocked: the pop-up may show again, which is harmless */
  }
}

/**
 * Homepage welcome for someone arriving through a campaign link (?campaign=CODE).
 * Congratulates them, shows the badge, and either claims it (signed in) or asks
 * them to sign in to claim it. Shown once per person; everything it states
 * (cafés, savings) comes from the real campaign, never made up.
 */
export function CampaignWelcome() {
  const searchParams = useSearchParams();
  const code = normaliseCode(searchParams.get('campaign'));
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const primaryRef = useRef<HTMLElement | null>(null);

  useEffect(() => setMounted(true), []);

  const page = useQuery({
    queryKey: ['campaign-page', code],
    queryFn: () => getCampaignPage(code!),
    enabled: Boolean(code && mounted),
    retry: false,
    staleTime: 30_000,
  });

  const claim = useMutation<CampaignClaim>({ mutationFn: () => claimCampaignBadge(code!) });
  const { mutate: claimBadge } = claim;

  useEffect(() => {
    if (!code || !page.data) return;
    storeCampaign(code, null);
    if (!wasSeen(code)) setOpen(true);
  }, [code, page.data]);

  useEffect(() => {
    if (open && isAuthenticated && code) claimBadge();
  }, [open, isAuthenticated, code, claimBadge]);

  const close = () => {
    if (code) markSeen(code);
    setOpen(false);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    primaryRef.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const deals = useMemo(
    () =>
      (page.data?.cafes ?? []).map((c) => ({
        id: c.id,
        name: c.name,
        maxSaved: Math.max(...c.offers.map((o) => o.saved)),
      })),
    [page.data],
  );

  if (!open || !code || !page.data) return null;
  const earned = Boolean(claim.data);
  const loginHref = `/login?redirect=${encodeURIComponent(`/?campaign=${code}`)}`;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm" onClick={close}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="campaign-welcome-title"
        onClick={(e) => e.stopPropagation()}
        className="khelo-pop-in relative flex w-full max-w-sm flex-col items-center gap-4 overflow-hidden rounded-3xl bg-card px-6 pb-6 pt-8 text-center shadow-overlay"
      >
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-0">
          {Array.from({ length: 22 }).map((_, i) => (
            <span
              key={i}
              className="khelo-confetti"
              style={{
                left: `${(i * 4.7 + 3) % 100}%`,
                background: CONFETTI[i % CONFETTI.length],
                animationDelay: `${(i % 7) * 0.12}s`,
                ['--dx' as string]: `${(i % 2 ? 1 : -1) * (10 + (i % 5) * 8)}px`,
              }}
            />
          ))}
        </div>

        <button
          type="button"
          onClick={close}
          aria-label="Close"
          className="absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-full text-text-secondary hover:bg-surface"
        >
          <X className="h-4 w-4" />
        </button>

        <h2 id="campaign-welcome-title" className="px-6 font-heading text-h2 font-bold text-text-primary">
          {earned ? 'Badge claimed!' : 'You unlocked the Day One OG badge'}
        </h2>
        <p className="text-body text-text-secondary">
          {earned
            ? 'It now lives on your profile. Special prices are applied automatically when you book.'
            : 'Special prices at partner cafés for a limited time, plus a collectible badge for your profile.'}
        </p>

        <SpecialAccessBadge earned size="md" className="my-1" />

        {deals.length > 0 && (
          <ul className="flex w-full flex-col gap-1.5 text-left">
            {deals.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3 rounded-xl bg-surface px-3 py-2 text-caption">
                <span className="font-semibold text-text-primary">{d.name}</span>
                <span className="font-semibold text-primary-dark">Save up to {rupees(d.maxSaved)}</span>
              </li>
            ))}
          </ul>
        )}

        <div className="flex w-full flex-col gap-2">
          {mounted && !isAuthenticated ? (
            <>
              <Link
                href={loginHref}
                ref={primaryRef as Ref<HTMLAnchorElement>}
                className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-primary px-4 text-body font-semibold text-white hover:bg-primary-dark"
              >
                Sign in to claim your badge
              </Link>
              <InAppBrowserNotice />
            </>
          ) : (
            <button
              type="button"
              ref={primaryRef as Ref<HTMLButtonElement>}
              onClick={close}
              className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-primary px-4 text-body font-semibold text-white hover:bg-primary-dark"
            >
              Start booking
            </button>
          )}
          <Link
            href={`/campaign/${code}?view=prices`}
            onClick={() => markSeen(code)}
            className="inline-flex min-h-[44px] items-center justify-center rounded-xl text-body font-semibold text-text-primary hover:bg-surface"
          >
            See all prices
          </Link>
        </div>
      </div>
    </div>
  );
}
