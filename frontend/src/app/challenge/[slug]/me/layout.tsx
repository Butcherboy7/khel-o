import type { Metadata } from 'next';
import type { ReactNode } from 'react';

// A player's own page: their phone and status. Never in search results.
export const metadata: Metadata = { title: 'Your challenge spot', robots: { index: false, follow: false } };

export default function MyChallengeLayout({ children }: { children: ReactNode }) {
  return children;
}
