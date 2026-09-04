import type { ReactNode } from 'react';
import Link from 'next/link';

const LEGAL_LINKS = [
  { href: '/about', label: 'About Us' },
  { href: '/terms', label: 'Terms & Conditions' },
  { href: '/privacy', label: 'Privacy Policy' },
  { href: '/refund-policy', label: 'Cancellation & Refunds' },
  { href: '/shipping-policy', label: 'Service Delivery' },
  { href: '/contact', label: 'Contact Us' },
];

export default function LegalLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-surface">
      <header className="sticky top-0 z-nav w-full border-b border-border bg-card/95 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-content items-center justify-between px-4 md:px-6">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary font-heading font-bold text-white shadow-card">
              k
            </div>
            <span className="font-heading text-h2 font-bold tracking-tight text-text-primary lowercase">
              khel-o
            </span>
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-content px-4 py-8 md:px-6 md:py-12">
        <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-8">
          <nav className="hidden lg:flex flex-col gap-1 h-fit sticky top-24" aria-label="Legal pages">
            {LEGAL_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-xl px-3 py-2 text-caption font-semibold text-text-secondary hover:bg-card hover:text-text-primary transition-colors"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <article className="prose-legal max-w-none">{children}</article>
        </div>
      </main>

      <footer className="border-t border-border bg-card">
        <div className="mx-auto max-w-content px-4 py-6 md:px-6 flex flex-wrap items-center justify-between gap-4">
          <span className="text-caption text-text-secondary">© {new Date().getFullYear()} KHEL-O. All rights reserved.</span>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {LEGAL_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-caption font-medium text-text-secondary hover:text-primary transition-colors"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}
