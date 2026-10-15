import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Page not found',
  robots: { index: false, follow: true },
};

// A dead link (a café that renamed, an old share) lands here instead of
// Next's bare default — and every link below keeps the visitor, and the
// crawler, moving through the site rather than bouncing off it.
const LINKS = [
  { href: '/cafes/hyderabad', label: 'Gaming cafés in Hyderabad' },
  { href: '/cafes/bengaluru', label: 'Gaming cafés in Bengaluru' },
  { href: '/browse', label: 'Browse everything' },
];

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-md flex-col items-center justify-center gap-6 px-4 py-16 text-center">
      <div className="flex flex-col gap-2">
        <p className="font-heading text-overline text-text-secondary">404</p>
        <h1 className="font-heading text-h1 text-text-primary">This page isn&apos;t here</h1>
        <p className="text-body text-text-secondary">
          The link may be old, or the café may have changed its name. Try one of these instead:
        </p>
      </div>
      <nav aria-label="Popular pages" className="flex w-full flex-col gap-2">
        {LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="rounded-2xl border border-border bg-card px-4 py-3 font-semibold text-text-primary hover:bg-surface"
          >
            {l.label} →
          </Link>
        ))}
      </nav>
      <Link href="/" className="text-body font-semibold text-primary-dark hover:underline">
        Back to KHEL-O home
      </Link>
    </main>
  );
}
