'use client';

import { useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/cn';

/**
 * Show a long list a page at a time instead of as one endless scroll.
 * `resetKey` (a filter, a search) jumps back to the first page when it changes.
 */
export function useShowMore<T>(items: readonly T[], step = 20, resetKey?: unknown) {
  // Half as many rows at a time on a phone, where each row is taller. Decided
  // after mount so the server and the first browser render agree.
  const [size, setSize] = useState(step);
  useEffect(() => {
    setSize(window.matchMedia('(max-width: 767px)').matches ? Math.max(5, Math.ceil(step / 2)) : step);
  }, [step]);
  const [n, setN] = useState(size);
  useEffect(() => setN(size), [resetKey, size]);
  return {
    visible: items.slice(0, n),
    rest: Math.max(0, items.length - n),
    more: () => setN((v) => v + size),
    step: size,
  };
}

export function ShowMoreButton({
  rest,
  step,
  onClick,
  noun = 'more',
  className,
}: {
  rest: number;
  step: number;
  onClick: () => void;
  noun?: string;
  className?: string;
}) {
  if (rest <= 0) return null;
  const next = Math.min(rest, step);
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'mx-auto inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-border bg-card px-5 text-body font-semibold text-text-primary transition-colors',
        'hover:border-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        className,
      )}
    >
      Show {next} {noun}
      <span className="font-normal text-text-secondary">· {rest} left</span>
      <ChevronDown className="h-4 w-4 text-text-secondary" aria-hidden />
    </button>
  );
}
