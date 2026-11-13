'use client';

import { cn } from '@/lib/cn';

/** "We're open 24 hours": one tap instead of guessing which times mean all day.
 *  Saved as opening and closing at 00:00, which every screen reads as 24/7. */
export function Open24Toggle({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className={cn(
        'flex min-h-[56px] w-full items-center justify-between gap-3 rounded-xl border-2 px-3 text-left transition-colors',
        on ? 'border-primary bg-primary/5' : 'border-border bg-card',
      )}
    >
      <span className="flex flex-col">
        <span className="font-semibold text-text-primary">Open 24 hours</span>
        <span className="text-caption text-text-secondary">Day and night, every day. Players can book any hour.</span>
      </span>
      <span className={cn('relative h-6 w-11 flex-shrink-0 rounded-full transition-colors', on ? 'bg-primary' : 'bg-border')} aria-hidden>
        <span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all', on ? 'left-[22px]' : 'left-0.5')} />
      </span>
    </button>
  );
}
