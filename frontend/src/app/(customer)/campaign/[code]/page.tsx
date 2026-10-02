'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowRight, Share2 } from 'lucide-react';
import { Button, ErrorState, Skeleton } from '@/components/ui';
import { InAppBrowserNotice } from '@/components/auth/InAppBrowserNotice';
import { ShareModal } from '@/components/customer/ShareModal';
import { SpecialAccessBadge } from '@/components/customer/SpecialAccessBadge';
import {
  claimCampaignBadge,
  getCampaignPage,
  type CampaignCafe,
  type CampaignClaim,
  type CampaignOfferRow,
} from '@/lib/api/promotions';
import { cafePath } from '@/lib/api/cafes';
import { storeCampaign, spotsLine } from '@/lib/campaign';
import { lengthLabel, offerUrgency } from '@/lib/offers';
import { useAuthStore } from '@/store/authStore';

const rupees = (n: number) => `₹${Number.isInteger(n) ? n : n.toFixed(2)}`;

function playersText(o: CampaignOfferRow): string | null {
  if (o.players === 1) return '1 player';
  if (o.players === 2) return '2 players';
  return null;
}

/** "1 player · per hour", "2 players · 1 hr", "1 hr". */
function rowLabel(o: CampaignOfferRow): string {
  return [playersText(o), o.exactLength ? lengthLabel(o.minutes) : 'per hour'].filter(Boolean).join(' · ');
}

/** One block per activity. Setups with identical lines (e.g. two PlayStations at the same
 *  price) are merged into one block, so the page lists each price once. */
function groupByActivity(offers: CampaignOfferRow[]): [string, CampaignOfferRow[]][] {
  const sorted = [...offers].sort(
    (a, b) =>
      a.activity.localeCompare(b.activity) ||
      (a.players ?? 0) - (b.players ?? 0) ||
      a.minutes - b.minutes ||
      Number(Boolean(a.when)) - Number(Boolean(b.when)),
  );
  const byActivity = new Map<string, CampaignOfferRow[]>();
  for (const o of sorted) byActivity.set(o.activity, [...(byActivity.get(o.activity) ?? []), o]);

  const signature = (rows: CampaignOfferRow[]) =>
    rows.map((r) => [r.players, r.minutes, r.exactLength, r.when, r.regularPrice, r.price].join('|')).join(';');
  const merged = new Map<string, { names: string[]; rows: CampaignOfferRow[] }>();
  Array.from(byActivity.entries()).forEach(([name, rows]) => {
    const sig = signature(rows);
    const hit = merged.get(sig);
    if (hit) hit.names.push(name);
    else merged.set(sig, { names: [name], rows });
  });
  return Array.from(merged.values()).map((m) => [m.names.join(' & '), m.rows] as [string, CampaignOfferRow[]]);
}

function OfferRow({ o }: { o: CampaignOfferRow }) {
  return (
    <li className="flex items-center justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <p className="text-body font-medium text-text-primary">{rowLabel(o)}</p>
        {o.when && <p className="text-caption text-text-secondary">{o.when}</p>}
      </div>
      <div className="flex flex-shrink-0 flex-col items-end">
        <p className="flex items-baseline gap-2">
          <span className="text-caption text-text-secondary line-through" aria-label={`Regular price ${rupees(o.regularPrice)}`}>
            {rupees(o.regularPrice)}
          </span>
          <span className="font-data text-h3 font-bold text-text-primary" aria-label={`Campaign price ${rupees(o.price)}`}>
            {rupees(o.price)}
          </span>
        </p>
        <p className="text-caption font-semibold text-primary-dark">Save {rupees(o.saved)}</p>
      </div>
    </li>
  );
}

function CafeCard({ cafe, code }: { cafe: CampaignCafe; code: string }) {
  const groups = useMemo(() => groupByActivity(cafe.offers), [cafe.offers]);
  return (
    <section aria-label={cafe.name} className="rounded-3xl border border-border bg-card p-4 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-heading text-h3 font-bold text-text-primary">{cafe.name}</h2>
          <p className="text-caption text-text-secondary">{cafe.city} &middot; Limited-Time Offer &ndash; Book Now!</p>
        </div>
      </div>

      <div className="mt-2 flex flex-col divide-y divide-border">
        {groups.map(([activity, rows]) => (
          <div key={activity} className="py-2">
            <h3 className="font-heading text-body font-bold text-text-primary">{activity}</h3>
            <ul className="divide-y divide-border/60">
              {rows.map((o) => (
                <OfferRow key={o.id} o={o} />
              ))}
            </ul>
          </div>
        ))}
      </div>

      <Link
        href={`${cafePath(cafe)}?promoCode=${encodeURIComponent(code)}`}
        className="mt-2 inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-body font-semibold text-white transition-colors hover:bg-primary-dark"
      >
        Book now at {cafe.name}
        <ArrowRight className="h-4 w-4" aria-hidden />
      </Link>
    </section>
  );
}

export default function CampaignLandingPage() {
  const params = useParams();
  const code = (typeof params.code === 'string' ? params.code : Array.isArray(params.code) ? params.code[0] : '').toUpperCase();

  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [mounted, setMounted] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  useEffect(() => setMounted(true), []);

  const page = useQuery({
    queryKey: ['campaign-page', code],
    queryFn: () => getCampaignPage(code),
    enabled: Boolean(code),
    retry: false,
    staleTime: 30_000,
  });

  // Remember the code so a later visit to any café or checkout still carries it.
  useEffect(() => {
    if (page.data) storeCampaign(code, null);
  }, [page.data, code]);

  // Entering the campaign while signed in earns the badge. Idempotent, so it is
  // safe to ask again (e.g. after sharing, to refresh the share counts).
  const claim = useMutation<CampaignClaim>({ mutationFn: () => claimCampaignBadge(code) });
  const { mutate: claimBadge } = claim;
  useEffect(() => {
    if (mounted && isAuthenticated && page.data) claimBadge();
  }, [mounted, isAuthenticated, page.data, claimBadge]);

  if (page.isLoading) {
    return (
      <div className="mx-auto flex max-w-xl flex-col gap-4 px-4 py-6">
        <Skeleton className="h-56 rounded-3xl" />
        <Skeleton className="h-64 rounded-3xl" />
      </div>
    );
  }

  if (page.isError || !page.data) {
    return (
      <div className="mx-auto max-w-md px-4 py-16">
        <ErrorState title="This campaign isn't running" message="The link may have expired. You can still browse every café." />
        <div className="mt-4 flex justify-center">
          <Link href="/" className="inline-flex min-h-[44px] items-center rounded-xl bg-primary px-5 font-semibold text-white">
            Browse cafés
          </Link>
        </div>
      </div>
    );
  }

  const { campaign, cafes } = page.data;
  const earned = Boolean(claim.data);
  const spots = spotsLine(campaign);
  const deadline = offerUrgency({ validUntil: campaign.endsAt });
  const cafeNames = cafes.map((c) => c.name);
  const shares = claim.data?.shares;

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-5 px-4 pb-8 pt-4">
      <section
        aria-label={campaign.name}
        className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-secondary via-secondary to-[#2B2D42] p-5 text-white"
      >
        <h1 className="font-heading text-h1 font-bold leading-tight">{campaign.name}</h1>
        <p className="mt-1.5 max-w-sm text-body text-white/80">
          Limited-Time KHELO Campaign. Special prices at {cafeNames.length > 1 ? 'these partner cafés' : cafeNames[0] ?? 'our partner café'}, already shown below.
        </p>
        {(spots || deadline) && (
          <p className="mt-2 text-caption font-semibold text-white">{[spots, deadline].filter(Boolean).join(' · ')}</p>
        )}

        <div className="mt-5 flex flex-col items-start gap-3">
          <SpecialAccessBadge earned={earned} size="md" />
          {mounted && !isAuthenticated && (
            <div className="flex w-full flex-col gap-2">
              <Link
                href={`/login?redirect=${encodeURIComponent(`/campaign/${code}`)}`}
                className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-white px-4 text-body font-semibold text-secondary"
              >
                Sign in to claim your badge
              </Link>
              <InAppBrowserNotice />
            </div>
          )}
          {earned && (
            <p className="text-caption text-white/80" aria-live="polite">
              {claim.data?.newlyEarned ? 'Badge earned. It now lives on your profile.' : 'You hold this badge. It lives on your profile.'}
            </p>
          )}
        </div>
      </section>

      {cafes.map((c) => (
        <CafeCard key={c.id} cafe={c} code={campaign.code} />
      ))}

      <p className="text-center text-caption text-text-secondary">
        Prices include the offer and apply automatically at checkout. Offers can end without notice.
      </p>

      <section className="flex flex-col gap-2 rounded-3xl border border-border bg-card p-4">
        <h2 className="font-heading text-h3 font-bold text-text-primary">Bring your squad</h2>
        <p className="text-caption text-text-secondary">Send this page to friends so they get the same special prices.</p>
        <Button variant="secondary" fullWidth className="gap-2" onClick={() => setShareOpen(true)}>
          <Share2 className="h-4 w-4" aria-hidden />
          Share with friends
        </Button>
        {shares && shares.shared > 0 && (
          <p className="text-center text-caption text-text-secondary" aria-live="polite">
            You shared this {shares.shared} {shares.shared === 1 ? 'time' : 'times'}
            {shares.opened > 0 ? ` and ${shares.opened} ${shares.opened === 1 ? 'friend' : 'friends'} opened it` : ''}.
          </p>
        )}
      </section>

      <ShareModal
        isOpen={shareOpen}
        onClose={() => {
          setShareOpen(false);
          if (isAuthenticated) claimBadge();
        }}
        heading="Share KHELO Special Access"
        message="Special KHELO prices at partner gaming cafés for a limited time. Grab yours:"
        path={`/campaign/${code}`}
        context="campaign"
        campaign={code.toLowerCase()}
      />
    </div>
  );
}
