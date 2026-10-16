import type { ReactNode } from 'react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Help & Support',
  description: 'Stuck with a booking, a payment or a café? Message the KHEL-O team. No account needed.',
};

export default function SupportLayout({ children }: { children: ReactNode }) {
  return children;
}
