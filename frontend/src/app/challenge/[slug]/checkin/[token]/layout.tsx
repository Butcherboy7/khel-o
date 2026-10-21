import type { Metadata } from 'next';
import type { ReactNode } from 'react';

// A door scan: personal, never in search results.
export const metadata: Metadata = { title: 'Challenge check-in', robots: { index: false, follow: false } };

export default function DoorCheckinLayout({ children }: { children: ReactNode }) {
  return children;
}
