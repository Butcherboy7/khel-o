'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { AuthGuard } from '@/components/layout/AuthGuard';
import { CustomerShell } from '@/components/layout/CustomerShell';

// Browsable without an account: discovery, a café's public listing, and the
// booking wizard up to the point of payment. Auth is only required at the
// "Confirm & Pay" action itself (checked inline in bookings/new), and on
// every other customer route below (bookings list/detail, rewards, profile,
// notifications, support, partner) via AuthGuard as before.
function isPublicPath(pathname: string): boolean {
  return pathname === '/' || pathname.startsWith('/cafe/') || pathname === '/bookings/new';
}

/**
 * Customer portal layout.
 * - AuthGuard: redirects unauthenticated to /login.
 *   Allows gamer role. cafe_owner/staff/admin go to their portals.
 * - Public-path exception: Explore, café detail, and the booking wizard
 *   render without AuthGuard so anyone can browse before creating an account.
 * - CustomerShell: top bar (mobile) + sidebar (desktop) + bottom nav (mobile).
 *   CustomerShell itself renders correctly whether or not a user is signed in.
 */
export default function CustomerLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  if (isPublicPath(pathname)) {
    return <CustomerShell>{children}</CustomerShell>;
  }

  return (
    <AuthGuard allowedRoles={['gamer', 'cafe_owner', 'staff', 'admin']}>
      <CustomerShell>{children}</CustomerShell>
    </AuthGuard>
  );
}
