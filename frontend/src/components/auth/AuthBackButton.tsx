'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

/** Back to wherever the visitor came from; home when the page was opened directly. */
export function AuthBackButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => (window.history.length > 1 ? router.back() : router.push('/'))}
      className="absolute left-3 top-3 inline-flex min-h-[44px] items-center gap-1.5 rounded-full px-3 text-body font-semibold text-text-secondary transition-colors hover:bg-card hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden />
      Back
    </button>
  );
}
