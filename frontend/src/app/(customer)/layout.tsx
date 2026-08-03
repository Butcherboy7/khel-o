import type { ReactNode } from 'react';
import { AuthGuard } from '@/components/layout/AuthGuard';
import { CustomerShell } from '@/components/layout/CustomerShell';

/**
 * Customer portal layout.
 * - AuthGuard: redirects unauthenticated to /login.
 *   Allows gamer role. cafe_owner/staff/admin go to their portals.
 * - Onboarding exception: gamer can access /owner/onboarding
 *   (handled separately in owner layout — not applicable here).
 * - CustomerShell: top bar (mobile) + sidebar (desktop) + bottom nav (mobile).
 */
export default function CustomerLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGuard allowedRoles={['gamer', 'cafe_owner', 'staff', 'admin']}>
      <CustomerShell>{children}</CustomerShell>
    </AuthGuard>
  );
}
