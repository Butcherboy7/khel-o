'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { CircleHelp, GraduationCap } from 'lucide-react';
import { PAGE_GUIDES } from '@/lib/ownerGuideCopy';
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

/**
 * The one help control on an owner page: a "?" that opens a small card with what
 * this page is for, in one sentence, and "Show me how" (the page's Tutorial).
 * It replaces an ⓘ plus a big Tutorial pill on every header, which made each
 * screen open with three things to read before the owner reached their work.
 */
export function PageHelp({ page, className }: { page: GuidePage; className?: string }) {
  const enabled = useOwnerTourStore((s) => s.enabled);
  const startLesson = useOwnerTourStore((s) => s.startLesson);
  const pathname = usePathname();
  usePageGuide(page);
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  return (
    <div ref={wrap} className={cn('relative flex-shrink-0', className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={id}
        aria-label="Help with this page"
        title="Help with this page"
        data-tour="page-help"
        className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card text-text-secondary transition-colors hover:border-primary/40 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11"
      >
        <CircleHelp className="h-5 w-5" aria-hidden />
      </button>
      {open && (
        <div
          id={id}
          role="dialog"
          aria-label="About this page"
          className="qf-fade absolute right-0 top-full z-40 mt-2 w-[min(300px,calc(100vw-32px))] rounded-2xl border border-border bg-card p-4 text-left shadow-xl"
        >
          <p className="text-body text-text-primary">{PAGE_GUIDES[page].info}</p>
          {enabled && (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                startLesson(page, pathname);
              }}
              className="mt-3 inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-primary px-4 text-body font-semibold text-white hover:bg-primary-dark"
            >
              <GraduationCap className="h-4 w-4" aria-hidden /> Show me how
            </button>
          )}
        </div>
      )}
    </div>
  );
}
