'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { AuthGuard } from '@/components/layout/AuthGuard';
import { CustomerShell } from '@/components/layout/CustomerShell';

// Browsable without an account: discovery, a café's public listing, city
// landing pages, and the booking wizard up to the point of payment. Auth is
// only required at the "Confirm & Pay" action itself (checked inline in
// bookings/new), and on every other customer route below (bookings
// list/detail, achievements, profile, notifications, support, partner) via
// AuthGuard as before.
function isPublicPath(pathname: string): boolean {
  return (
    pathname === '/' ||
    pathname.startsWith('/cafe/') ||
    pathname.startsWith('/cafes/') ||
    pathname === '/browse' ||
    pathname === '/bookings/new' ||
    // Offer links (reel / QR) must open for anyone: the code is applied on the
    // way to the café and login is only asked for at payment.
    pathname.startsWith('/redeem/') ||
    // The campaign landing page (shared on Instagram / WhatsApp) is public too.
    pathname.startsWith('/campaign/') ||
    // "Know a café owner?" — the form asks for sign-in itself, after the pitch.
    pathname === '/know-the-owner' ||
    // Tournament listing and event pages are shareable; registering asks for sign-in.
    pathname === '/tournaments' ||
    (pathname.startsWith('/tournaments/') && !pathname.endsWith('/pass'))
  );
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
