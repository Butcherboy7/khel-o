import type { ReactNode } from 'react';
import Link from 'next/link';
import { SocialLinks } from '@/components/layout/SocialLinks';

const FOOTER_LINKS = [
  { href: '/about', label: 'About Us' },
  { href: '/terms', label: 'Terms & Conditions (Gamers)' },
  { href: '/owner-terms', label: 'Terms & Conditions (Café Partners)' },
  { href: '/privacy', label: 'Privacy Policy' },
  { href: '/cookie-policy', label: 'Cookie Policy' },
  { href: '/refund-policy', label: 'Cancellation & Refunds' },
  { href: '/shipping-policy', label: 'Service Delivery' },
  { href: '/contact', label: 'Contact Us' },
];

/** The About page tells a story, so it gets the public header and footer
 *  of the legal pages without their sidebar and document styling. */
export default function AboutLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-surface">
      <header className="sticky top-0 z-nav w-full border-b border-border bg-card/95 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-content items-center justify-between px-4 md:px-6">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary font-heading font-bold text-white shadow-card">
              k
            </div>
            <span className="font-heading text-h2 font-bold lowercase tracking-tight text-text-primary">khel-o</span>
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-4 py-10 md:px-6 md:py-14">{children}</main>

      <footer className="border-t border-border bg-card">
        <div className="mx-auto flex max-w-content flex-wrap items-center justify-between gap-4 px-4 py-6 md:px-6">
          <span className="text-caption text-text-secondary">
            © {new Date().getFullYear()} KHEL-O. All rights reserved. Made with ❤️ in Hyderabad
          </span>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {FOOTER_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-caption font-medium text-text-secondary transition-colors hover:text-primary"
              >
                {link.label}
              </Link>
            ))}
            <SocialLinks className="border-l border-border pl-2" />
          </div>
        </div>
      </footer>
    </div>
  );
}
