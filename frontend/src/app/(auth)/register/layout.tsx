import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Create account',
  // Sign-in screens aren't landing pages; keep them out of search results.
  robots: { index: false, follow: true },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
