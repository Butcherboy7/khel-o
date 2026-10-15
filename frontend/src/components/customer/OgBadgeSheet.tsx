'use client';

import { useState } from 'react';
import { Flag } from 'lucide-react';
import { BottomSheet, Button } from '@/components/ui';
import { ShareModal } from '@/components/customer/ShareModal';
import { OG_BADGE_NAME } from '@/components/customer/SpecialAccessBadge';

interface OgBadgeSheetProps {
  isOpen: boolean;
  onClose: () => void;
  /** The player's first name; falls back to a neutral "You". */
  firstName?: string;
  /** When the badge was earned (ISO date). */
  grantedAt?: string | null;
  /** The campaign link the badge came from; without it there's nothing to share. */
  campaignCode?: string | null;
  /** Order of earning the badge (1 = first), from the server. */
  memberNumber?: number | null;
}

function joinedLabel(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
}

/**
 * Details for the OG badge, opened by tapping it on the profile or the
 * achievements page. Shows only facts we have: the real join month and a
 * "Limited" rarity, never an invented member number.
 */
export function OgBadgeSheet({ isOpen, onClose, firstName, grantedAt, campaignCode, memberNumber }: OgBadgeSheetProps) {
  const [shareOpen, setShareOpen] = useState(false);
  const joined = joinedLabel(grantedAt);
  const who = firstName?.trim() || 'You';

  return (
    <>
      <BottomSheet isOpen={isOpen && !shareOpen} onClose={onClose} ariaLabel={`${OG_BADGE_NAME} OG badge`}>
        <div className="flex flex-col gap-4 pb-2">
          <div className="mythic w-full">
            <div className="mythic-face flex flex-col items-center gap-1 px-4 py-6 text-center">
              <span className="mb-1.5 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#F59E0B] to-[#E54D42] text-white">
                <Flag className="h-7 w-7 fill-white" aria-hidden />
              </span>
              <span className="text-[11px] font-bold uppercase tracking-[0.25em] text-[#F59E0B]">OG member</span>
              <span className="font-heading text-h1 font-bold text-white">{OG_BADGE_NAME}</span>
              <span className="text-caption text-white/70">Backing KHELO since day 1</span>
              <span className="mythic-sheen" aria-hidden />
            </div>
          </div>

          <div className="flex flex-col gap-1.5 text-center">
            <h2 className="font-heading text-h3 font-bold text-text-primary">You were here before it was cool.</h2>
            <p className="text-body text-text-secondary">
              <span className="font-semibold text-text-primary">{who}</span> {who === 'You' ? 'are' : 'is'} an OG member of
              KHELO, supporting us since day 1. When we were just a few cafés and a big idea, you showed up.
            </p>
          </div>

          <dl className={`grid gap-2.5 ${memberNumber ? 'grid-cols-3' : 'grid-cols-2'}`}>
            {joined && (
              <div className="rounded-xl bg-surface px-3 py-2.5 text-center">
                <dt className="text-[10px] font-semibold uppercase tracking-wider text-text-secondary">Joined</dt>
                <dd className="font-data text-body font-bold text-text-primary">{joined}</dd>
              </div>
            )}
            {memberNumber ? (
              <div className="rounded-xl bg-surface px-3 py-2.5 text-center">
                <dt className="text-[10px] font-semibold uppercase tracking-wider text-text-secondary">Member</dt>
                <dd className="font-data text-body font-bold text-text-primary">#{String(memberNumber).padStart(4, '0')}</dd>
              </div>
            ) : null}
            <div className="rounded-xl bg-surface px-3 py-2.5 text-center">
              <dt className="text-[10px] font-semibold uppercase tracking-wider text-text-secondary">Rarity</dt>
              <dd className="font-data text-body font-bold text-text-primary">Limited</dd>
            </div>
          </dl>

          <div className="flex flex-col gap-1">
            {campaignCode && (
              <Button variant="primary" size="lg" fullWidth onClick={() => setShareOpen(true)}>
                Share my OG badge
              </Button>
            )}
            <Button variant="ghost" size="lg" fullWidth onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      </BottomSheet>

      {campaignCode && (
        <ShareModal
          isOpen={isOpen && shareOpen}
          onClose={() => setShareOpen(false)}
          heading="Share your OG badge"
          message="I'm an OG member of KHELO. Special prices at partner gaming cafés for a limited time. Grab yours:"
          path={`/?campaign=${campaignCode}`}
          context="campaign"
          campaign={campaignCode.toLowerCase()}
        />
      )}
    </>
  );
}
