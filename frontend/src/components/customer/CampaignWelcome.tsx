'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowRight, Gamepad2, X } from 'lucide-react';
import { SpecialAccessBadge } from '@/components/customer/SpecialAccessBadge';
import { trackAction } from '@/lib/api/analyticsEvents';
import { cafePath } from '@/lib/api/cafes';
import { claimCampaignBadge, getCampaignPage, type CampaignCafe, type CampaignClaim } from '@/lib/api/promotions';
import { headlineDeals, markBadgeClaimed, normaliseCode, readStoredCampaign, storeCampaign } from '@/lib/campaign';
import { lengthLabel } from '@/lib/offers';
import { titleCaseCity } from '@/lib/format';
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

/** One café with its real headline prices and a Book button straight to it. */
function DealCard({
  cafe,
  code,
  where,
  onBook,
}: {
  cafe: CampaignCafe;
  code: string;
  where: 'popup' | 'strip';
  onBook?: () => void;
}) {
  const { hour, cheapest, maxSaved } = useMemo(() => headlineDeals(cafe.offers), [cafe.offers]);
  const lead = hour ?? cheapest;
  const href = `${cafePath(cafe)}?promoCode=${encodeURIComponent(code)}`;
  const [photoOk, setPhotoOk] = useState(Boolean(cafe.photo));
  return (
    <li className="flex gap-3 rounded-2xl border border-border bg-card p-3 text-left">
      <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-xl bg-surface">
        {cafe.photo && photoOk ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={cafe.photo} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" onError={() => setPhotoOk(false)} />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-text-secondary">
            <Gamepad2 className="h-6 w-6" aria-hidden />
          </div>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="min-w-0">
          <p className="truncate font-heading text-body font-bold text-text-primary">{cafe.name}</p>
          <p className="truncate text-caption text-text-secondary">{titleCaseCity(cafe.city)}</p>
        </div>
        {lead && (
          <p className="flex flex-wrap items-baseline gap-x-1.5 text-caption text-text-secondary">
            <span className="truncate">
              {lead.activity} · {lengthLabel(lead.minutes)}
            </span>
            <span className="line-through" aria-label={`Regular price ${rupees(lead.regularPrice)}`}>
              {rupees(lead.regularPrice)}
            </span>
            <span className="font-data text-body font-bold text-text-primary">{rupees(lead.price)}</span>
            {lead.when && <span className="rounded-full bg-surface px-1.5 py-0.5 text-[11px] font-semibold">{lead.when}</span>}
          </p>
        )}
        {hour && cheapest && (
          <p className="text-caption text-text-secondary">
            Or try {lengthLabel(cheapest.minutes)} for <span className="font-semibold text-text-primary">{rupees(cheapest.price)}</span>
          </p>
        )}
        <div className="mt-1 flex items-center justify-between gap-2">
          <span className="text-caption font-semibold text-primary-dark">Save up to {rupees(maxSaved)}</span>
          <Link
            href={href}
            onClick={() => {
              trackAction(`campaign_${where}_book_cafe`, { code, cafe: cafe.name }, cafe.id);
              onBook?.();
            }}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-primary px-4 text-body font-semibold text-white hover:bg-primary-dark"
          >
            Book
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </div>
    </li>
  );
}

/**
 * Homepage for someone arriving through a campaign link (?campaign=CODE).
 *
 * The first version led with "Sign in to claim your badge": 54 of the first 55
 * reel visitors left right there (mostly inside Instagram, where Google sign-in
 * is shaky). Now it leads with what they came for: each café, its real special
 * price and a Book button. Signing in waits until checkout, and the badge is
 * given then (CampaignBadgeClaimer). After the pop-up closes, the same deals
 * stay pinned at the top of the page so nobody has to find them again.
 */
export function CampaignWelcome() {
  const searchParams = useSearchParams();
  const urlCode = normaliseCode(searchParams.get('campaign'));
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [storedCode, setStoredCode] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setMounted(true);
    const stored = readStoredCampaign();
    // Someone who came through a public campaign and returns to the homepage
    // later still sees their prices at the top.
    if (stored && !stored.cafeId) setStoredCode(stored.code);
  }, []);
  const code = urlCode ?? storedCode;

  const page = useQuery({
    queryKey: ['campaign-page', code],
    queryFn: () => getCampaignPage(code!),
    enabled: Boolean(code && mounted),
    retry: false,
    staleTime: 30_000,
  });

  const claim = useMutation<CampaignClaim>({
    mutationFn: () => claimCampaignBadge(code!),
    onSuccess: (r) => {
      if (code) markBadgeClaimed(code);
      if (r.newlyEarned) trackAction('campaign_badge_claimed', { code });
    },
  });
  const { mutate: claimBadge } = claim;

  useEffect(() => {
    if (!urlCode || !page.data) return;
    storeCampaign(urlCode, null);
    if (!wasSeen(urlCode)) {
      setOpen(true);
      trackAction('campaign_popup_shown', { code: urlCode, cafes: page.data.cafes.length });
    }
  }, [urlCode, page.data]);

  useEffect(() => {
    if (open && isAuthenticated && code) claimBadge();
  }, [open, isAuthenticated, code, claimBadge]);

  const close = (how: 'close' | 'see_prices' | 'book' = 'close') => {
    if (how === 'close') trackAction('campaign_popup_close', { code });
    if (code) markSeen(code);
    setOpen(false);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    dialogRef.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!code || !page.data || page.data.cafes.length === 0) return null;
  const { campaign, cafes } = page.data;
  const earned = Boolean(claim.data);
  const pricesHref = `/campaign/${code}?view=prices`;

  // Pop-up closed (or already seen): the deals sit at the top of the homepage.
  if (!open) {
    return (
      <section aria-labelledby="campaign-strip-title" className="mx-auto mb-4 flex max-w-wide flex-col gap-3 rounded-3xl bg-gradient-to-br from-secondary via-secondary to-[#2B2D42] p-4 text-white">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <h2 id="campaign-strip-title" className="font-heading text-body font-bold">
              Your special prices are on
            </h2>
            <p className="text-caption text-white/80">Applied automatically when you book. No code to type.</p>
          </div>
          <Link
            href={pricesHref}
            onClick={() => trackAction('campaign_strip_see_prices', { code })}
            className="hidden min-h-[44px] items-center rounded-xl px-3 text-caption font-semibold text-white underline-offset-4 hover:underline sm:inline-flex"
          >
            Every price
          </Link>
          <SpecialAccessBadge earned size="sm" className="hidden flex-shrink-0 sm:inline-flex" />
        </div>
        <ul className="grid gap-2 sm:grid-cols-2">
          {cafes.map((c) => (
            <DealCard key={c.id} cafe={c} code={campaign.code} where="strip" />
          ))}
        </ul>
        <Link
          href={pricesHref}
          onClick={() => trackAction('campaign_strip_see_prices', { code })}
          className="inline-flex min-h-[44px] items-center justify-center rounded-xl text-caption font-semibold text-white/90 sm:hidden"
        >
          See every special price
        </Link>
      </section>
    );
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center overflow-y-auto bg-black/60 p-3 backdrop-blur-sm sm:items-center sm:p-4" onClick={() => close()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="campaign-welcome-title"
        ref={dialogRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="khelo-pop-in outline-none relative flex max-h-[92vh] w-full max-w-md flex-col gap-4 overflow-y-auto rounded-3xl bg-card px-4 pb-4 pt-6 shadow-overlay sm:px-5"
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
          onClick={() => close()}
          aria-label="Close"
          className="absolute right-2 top-2 flex h-11 w-11 items-center justify-center rounded-full text-text-secondary hover:bg-surface"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex flex-col gap-1 pr-10">
          <h2 id="campaign-welcome-title" className="font-heading text-h2 font-bold leading-tight text-text-primary">
            Special prices unlocked
          </h2>
          <p className="text-body text-text-secondary">Pick a café and book. The lower price is already applied.</p>
        </div>

        <ul className="flex flex-col gap-2">
          {cafes.map((c) => (
            <DealCard
              key={c.id}
              cafe={c}
              code={campaign.code}
              where="popup"
              onBook={() => close('book')}
            />
          ))}
        </ul>

        <div className="flex flex-col gap-1 text-center">
          <Link
            href={pricesHref}
            onClick={() => {
              trackAction('campaign_popup_see_prices', { code });
              close('see_prices');
            }}
            className="inline-flex min-h-[44px] items-center justify-center rounded-xl text-body font-semibold text-text-primary hover:bg-surface"
          >
            See every special price
          </Link>
          <p className="flex items-center justify-center gap-2 text-left text-caption text-text-secondary" aria-live="polite">
            <SpecialAccessBadge earned size="sm" className="flex-shrink-0" />
            <span>
            {earned
              ? 'Your Day One OG badge is on your profile.'
              : mounted && isAuthenticated
                ? 'Adding your Day One OG badge…'
                : 'Yours when you sign in to book. No sign-up to look around.'}
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}
