'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { AuthGuard } from '@/components/layout/AuthGuard';
import { OwnerShell } from '@/components/layout/OwnerShell';
import { ClaimListingView } from '@/components/owner/ClaimListingView';
import { useAuthStore } from '@/store/authStore';

/**
 * Owner portal layout.
 *
 * Role logic (per audit C1 fix):
 * - /owner/onboarding is accessible to 'gamer' role so the conversion funnel works.
 * - All other /owner/* routes require cafe_owner, staff, or admin.
 * - Staff sees a simplified shell (isStaff=true).
 *
 * This fixes the critical bug where gamers couldn't access onboarding.
 */
function OwnerLayoutInner({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  // activeRole (the sanitized, server-validated current workspace — see
  // sanitizeActiveRole in authStore.ts) is the correct signal here, not
  // user.role. user.role is the legacy single-value column that the rest of
  // this codebase already treats as untrustworthy/stale for authorization —
  // using it here meant a staff account whose stale role column didn't say
  // "staff" saw the FULL owner shell (Payouts & Razorpay, Staff Management,
  // Café Settings), none of which they're actually allowed to use, which is
  // exactly the "confusing staff dashboard" problem this fixes.
  const activeRole = useAuthStore((s) => s.activeRole);
  const isStaff = activeRole === 'staff';
  const user = useAuthStore((s) => s.user);

  // If user is undergoing onboarding, hide sidebar navigation
  if (pathname === '/owner/onboarding') {
    return <div className="min-h-screen bg-surface">{children}</div>;
  }

  // Seeded lead-listing accounts were created by KHEL-O and handed over, so
  // they arrive on an @khel-o.com address that has no real mailbox behind it.
  // Block the portal until the owner moves to their own email and password:
  // until then the account's only recovery path is an address nobody can
  // receive mail at, on a café row that will later hold bank details.
  // Checked here rather than per-page so no owner route can be reached around
  // it. The backend enforces the same precondition on /owner/cafe/claim.
  const needsClaim = Boolean(user?.email?.endsWith('@khel-o.com'));
  if (needsClaim && user) {
    return (
      <div className="min-h-screen bg-surface">
        <ClaimListingView placeholderEmail={user.email} />
      </div>
    );
  }

  return <OwnerShell isStaff={isStaff}>{children}</OwnerShell>;
}

export default function OwnerLayout({ children }: { children: ReactNode }) {
  // Allow gamers, cafe_owners, staff, and admin to access /owner pages so onboarding and application status dashboards work seamlessly
  const allowedRoles = ['gamer', 'cafe_owner', 'staff', 'admin'] as const;

  return (
    <AuthGuard allowedRoles={[...allowedRoles]}>
      <OwnerLayoutInner>{children}</OwnerLayoutInner>
    </AuthGuard>
  );
}
