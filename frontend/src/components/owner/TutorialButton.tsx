'use client';

import { usePathname } from 'next/navigation';
import { GraduationCap } from 'lucide-react';
import { cn } from '@/lib/cn';
import { usePageGuide } from '@/hooks/useOwnerGuide';
import type { GuidePage } from '@/lib/ownerGuideCopy';
import { useOwnerTourStore } from '@/store/ownerTourStore';

/**
 * Plays this page's Tutorial lesson: the spotlight walks through the real
 * buttons here. Replaces the old "How this page works" box, which pushed the
 * page's own content down on every early visit. Owners only (the tutorial is
 * not mounted for staff, so the button hides itself there).
 */
export function TutorialButton({ page, className }: { page: GuidePage; className?: string }) {
  const enabled = useOwnerTourStore((s) => s.enabled);
  const startLesson = useOwnerTourStore((s) => s.startLesson);
  const pathname = usePathname();
  // Still counts the visit, as the box did.
  usePageGuide(page);
  if (!enabled) return null;

  return (
    <button
      type="button"
      onClick={() => startLesson(page, pathname)}
      className={cn(
        'inline-flex min-h-[44px] flex-shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-3.5 text-caption font-semibold text-text-primary transition-colors',
        'hover:border-primary/40 hover:text-primary-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        className,
      )}
    >
      <GraduationCap className="h-4 w-4 text-primary" aria-hidden />
      Tutorial
    </button>
  );
}
