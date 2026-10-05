'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowRight, Gamepad2, Gift, X } from 'lucide-react';
import { SpecialAccessBadge } from '@/components/customer/SpecialAccessBadge';
import { trackAction } from '@/lib/api/analyticsEvents';
import { cafePath } from '@/lib/api/cafes';
import { claimCampaignBadge, getCampaignPage, type CampaignCafe, type CampaignClaim } from '@/lib/api/promotions';
import { headlineDeals, markBadgeClaimed, normaliseCode, readStoredCampaign, storeCampaign } from '@/lib/campaign';
import { lengthLabel } from '@/lib/offers';
import { titleCaseCity } from '@/lib/format';
import { useAuthStore } from '@/store/authStore';

const SEEN_KEY = 'khelo_welcome_seen_v1';
// Visitors who stay this long are interested enough for the offer; anyone
// quicker is left alone and can tap the gift button instead.
const POPUP_AFTER_MS = 8000;

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
  const photo = cafe.photo?.url ?? null;
  const [photoOk, setPhotoOk] = useState(Boolean(photo));
  return (
    <li className="flex gap-3 rounded-2xl border border-border bg-card p-3 text-left">
      <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-xl bg-surface">
        {photo && photoOk ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={photo} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" onError={() => setPhotoOk(false)} />
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
    if (wasSeen(urlCode)) return;
    const cafeCount = page.data.cafes.length;
    const timer = window.setTimeout(() => {
      setOpen(true);
      trackAction('campaign_popup_shown', { code: urlCode, cafes: cafeCount });
    }, POPUP_AFTER_MS);
    return () => window.clearTimeout(timer);
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

  // Pop-up closed or not shown yet: just a small gift button, one tap to open.
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          trackAction('campaign_gift_open', { code });
          setOpen(true);
        }}
        aria-label="Special prices for you"
        className="fixed bottom-[calc(var(--bottom-nav-height)_+_env(safe-area-inset-bottom)_+_16px)] right-4 z-overlay flex h-14 w-14 items-center justify-center rounded-full bg-primary text-white shadow-float transition hover:bg-primary-dark active:scale-95 md:bottom-6"
      >
        <Gift className="h-6 w-6" aria-hidden />
        <span aria-hidden className="absolute right-1 top-1 h-3 w-3 rounded-full border-2 border-white bg-amber-400" />
      </button>
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
