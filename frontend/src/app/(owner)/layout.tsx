'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { AuthGuard } from '@/components/layout/AuthGuard';
import { OwnerShell } from '@/components/layout/OwnerShell';
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
  const user = useAuthStore((s) => s.user);
  const isStaff = user?.role === 'staff';

  return <OwnerShell isStaff={isStaff}>{children}</OwnerShell>;
}

export default function OwnerLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isOnboarding = pathname === '/owner/onboarding';

  // Allow gamers to reach the onboarding page — this fixes audit issue C1
  const allowedRoles = isOnboarding
    ? (['gamer', 'cafe_owner', 'staff', 'admin'] as const)
    : (['cafe_owner', 'staff', 'admin'] as const);

  return (
    <AuthGuard allowedRoles={[...allowedRoles]}>
      <OwnerLayoutInner>{children}</OwnerLayoutInner>
    </AuthGuard>
  );
}
