'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Info } from 'lucide-react';
import { cn } from '@/lib/cn';

/** A small "i" button with a tip. Tap opens it on phones (hover-only tips never show there); hover or keyboard focus
 *  opens it on a computer. Escape, a tap elsewhere or tapping again closes it. Opens towards whichever side of the
 *  screen has room, so a card in the left column never pushes the bubble off-screen. */
export function InfoTip({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  const [alignLeft, setAlignLeft] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const id = useId();

  const show = () => {
    const r = ref.current?.getBoundingClientRect();
    if (r) setAlignLeft(r.right < 260);
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', esc); };
  }, [open]);

  return (
    <span ref={ref} className={cn('relative inline-flex', className)}
      // Mouse only: a tap also fires enter events, which would open then instantly close it on the click.
      onPointerEnter={(e) => { if (e.pointerType === 'mouse') show(); }}
      onPointerLeave={(e) => { if (e.pointerType === 'mouse') setOpen(false); }}>
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onClick={(e) => { e.stopPropagation(); if (open) setOpen(false); else show(); }}
        // Keyboard focus only; a tap focuses too and the click right after would close it again.
        onFocus={(e) => { if (e.currentTarget.matches(':focus-visible')) show(); }}
        onBlur={() => setOpen(false)}
        className="grid h-9 w-9 place-items-center rounded-full text-text-tertiary transition-colors hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        <span className="grid h-6 w-6 place-items-center rounded-full bg-card/90 shadow-sm ring-1 ring-border">
          <Info className="h-3.5 w-3.5" aria-hidden />
        </span>
      </button>
      {open && (
        <span
          role="tooltip"
          id={id}
          className={cn(
            'absolute top-full z-40 mt-1 w-60 max-w-[calc(100vw-2rem)] rounded-xl bg-text-primary px-3 py-2.5',
            'text-[13px] font-medium leading-snug text-white shadow-lg',
            alignLeft ? 'left-0' : 'right-0',
          )}
        >
          {children}
        </span>
      )}
    </span>
  );
}
