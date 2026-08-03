import type { ReactNode } from 'react';

/**
 * Auth layout — no navigation chrome, just the content.
 * Handles login and register pages with a clean centered presentation.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-4 py-8">
      {children}
    </div>
  );
}
