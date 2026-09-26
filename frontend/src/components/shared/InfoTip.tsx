'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Info } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useGuidePulse } from '@/hooks/useOwnerGuide';

interface InfoTipProps {
  /** One or two plain-language lines explaining the thing it sits next to. */
  text: string;
  /** Which edge of the icon the popover lines up with; use 'end' near the right edge. */
  align?: 'start' | 'end';
  /** What the icon explains, for screen readers (“About bookings”). */
  label?: string;
  /** Customer-facing: never pulses and never touches the owner guide API. */
  quiet?: boolean;
  className?: string;
}

/**
 * Tap-to-explain ⓘ for owner screens. Tap (not hover) because most owners are
 * on a phone. Pulses during the owner's first few sessions so they discover
 * help exists; a tapped icon stops pulsing since it's been found.
 */
export function InfoTip({ text, align = 'start', label = 'What is this?', quiet = false, className }: InfoTipProps) {
  const [open, setOpen] = useState(false);
  const [found, setFound] = useState(false);
  const pulse = useGuidePulse(!quiet) && !found;
  const wrapRef = useRef<HTMLSpanElement>(null);
  const popId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <span ref={wrapRef} className={cn('relative inline-flex align-middle', className)}>
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-describedby={open ? popId : undefined}
        onClick={(e) => {
          // Often sits inside a card that is itself a link — explain, don't navigate.
          e.preventDefault();
          e.stopPropagation();
          setOpen((o) => !o);
          setFound(true);
        }}
        className={cn(
          'inline-flex h-6 w-6 items-center justify-center rounded-full transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
          pulse
            ? 'text-primary motion-safe:animate-guide-ring motion-reduce:ring-2 motion-reduce:ring-primary/30'
            : 'text-text-secondary hover:text-text-primary'
        )}
      >
        <Info className="h-4 w-4" aria-hidden />
      </button>
      {open && (
        <span
          id={popId}
          role="tooltip"
          className={cn(
            'absolute top-full z-dropdown mt-2 w-64 max-w-[calc(100vw-2rem)] rounded-xl bg-secondary px-3 py-2.5',
            'text-caption font-medium normal-case tracking-normal text-white shadow-float text-left',
            align === 'end' ? 'right-0' : 'left-0'
          )}
        >
          {text}
        </span>
      )}
    </span>
  );
}
