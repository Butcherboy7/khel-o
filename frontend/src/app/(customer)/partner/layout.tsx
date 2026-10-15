import type { ReactNode } from 'react';
import type { Metadata } from 'next';

// /partner is public now (see (customer)/layout.tsx isPublicPath), so search
// sees the real pitch instead of a sign-in redirect and can index it.
export const metadata: Metadata = {
  title: 'List Your Gaming Café, Snooker or Bowling Venue on KHEL-O',
  description:
    'Get online bookings for your gaming café, snooker hub or bowling alley in Hyderabad. Players see live availability and pay upfront, so fewer no-shows and no phone calls. Free to join.',
  alternates: { canonical: '/partner' },
};

export default function PartnerLayout({ children }: { children: ReactNode }) {
  return children;
}
