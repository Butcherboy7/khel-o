import type { ReactNode } from 'react';
import type { Metadata } from 'next';

// /partner sits behind sign-in, so a crawler only ever sees an empty shell.
// Keep it out of search until it has a public version.
export const metadata: Metadata = {
  title: 'List Your Gaming Café on KHEL-O',
  alternates: { canonical: '/partner' },
  robots: { index: false, follow: true },
};

export default function PartnerLayout({ children }: { children: ReactNode }) {
  return children;
}
