import type { ReactNode } from 'react';
import type { Metadata } from 'next';

// The page itself is a client component, so its title and canonical live here.
export const metadata: Metadata = {
  title: 'Know a Gaming Café Owner? Introduce Them to KHEL-O',
  description:
    'Know someone who runs a gaming café, snooker club or bowling alley in Hyderabad? Send us their details and we will reach out.',
  alternates: { canonical: '/know-the-owner' },
};

export default function KnowTheOwnerLayout({ children }: { children: ReactNode }) {
  return children;
}
