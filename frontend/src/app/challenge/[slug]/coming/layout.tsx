import type { Metadata } from 'next';
import type { ReactNode } from 'react';

// Opened from a WhatsApp message: personal, never in search results.
export const metadata: Metadata = { title: 'Yes, I’m coming', robots: { index: false, follow: false } };

export default function ComingLayout({ children }: { children: ReactNode }) {
  return children;
}
