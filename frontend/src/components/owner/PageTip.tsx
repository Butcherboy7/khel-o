'use client';

import { Lightbulb, X } from 'lucide-react';
import { usePageGuide } from '@/hooks/useOwnerGuide';
import { PAGE_GUIDES, type GuidePage } from '@/lib/ownerGuideCopy';

/**
 * “How this page works” box. Shows for an owner's first few visits to a page,
 * then retires itself; “Don't show again” retires it immediately and for good
 * (saved on the account, so it holds across phone and laptop).
 */
export function PageTip({ page }: { page: GuidePage }) {
  const { showTip, hideTip, dismissTip } = usePageGuide(page);
  if (!showTip) return null;

  return (
    <aside
      aria-label="How this page works"
      className="flex flex-col gap-2 rounded-2xl border border-primary/25 bg-primary/5 p-4 animate-fade-in-up"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-body-emphasis text-text-primary">
          <Lightbulb className="h-4 w-4 text-primary" aria-hidden />
          How this page works
        </span>
        <button
          type="button"
          onClick={hideTip}
          aria-label="Close tip"
          className="rounded-lg p-1 text-text-secondary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
      <ul className="flex list-disc flex-col gap-1 pl-5 text-caption text-text-primary">
        {PAGE_GUIDES[page].tips.map((tip) => (
          <li key={tip}>{tip}</li>
        ))}
      </ul>
      <div className="flex justify-end gap-4 text-caption font-semibold">
        <button type="button" onClick={hideTip} className="text-primary hover:underline">
          Got it
        </button>
        <button type="button" onClick={dismissTip} className="text-text-secondary hover:text-text-primary hover:underline">
          Don&apos;t show again
        </button>
      </div>
    </aside>
  );
}
