import type { ReactNode } from 'react';
import Link from 'next/link';

/**
 * Auth layout — no navigation chrome, just the content.
 * Handles login and register pages with a clean centered presentation.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-surface px-4 py-8">
      {children}

      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-caption text-text-secondary">
        <Link href="/terms" className="hover:text-primary transition-colors">Terms</Link>
        <Link href="/privacy" className="hover:text-primary transition-colors">Privacy</Link>
        <Link href="/refund-policy" className="hover:text-primary transition-colors">Refunds</Link>
        <Link href="/shipping-policy" className="hover:text-primary transition-colors">Service Delivery</Link>
        <Link href="/contact" className="hover:text-primary transition-colors">Contact</Link>
      </div>
    </div>
  );
}
