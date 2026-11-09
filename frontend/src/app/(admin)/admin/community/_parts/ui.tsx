'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export const field = 'min-h-[44px] w-full rounded-xl border border-border bg-card px-3 text-body text-text-primary placeholder:text-text-secondary/70 focus:border-primary focus:outline-none';
export const labelText = 'flex flex-col gap-1 text-caption font-semibold text-text-secondary';

export const when = (iso: string) =>
  new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
export const whenTime = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });

/** A titled block on the admin page: what it is, one line on how to use it, then the controls. */
export function Panel({ title, hint, action, children, className }: { title: string; hint?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('flex min-w-0 flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-card md:p-5', className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-heading text-h3 font-bold text-text-primary">{title}</h2>
          {hint && <p className="mt-0.5 max-w-prose text-caption text-text-secondary">{hint}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Delete and other one-way actions: first tap arms it, second tap does it. No browser pop-up. */
export function ConfirmButton({ onConfirm, children, armed = 'Tap again to confirm', disabled, className }: { onConfirm: () => void; children: ReactNode; armed?: string; disabled?: boolean; className?: string }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => setReady(false), 3500);
    return () => clearTimeout(t);
  }, [ready]);
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => (ready ? (setReady(false), onConfirm()) : setReady(true))}
      className={cn(
        'inline-flex min-h-[36px] items-center gap-1.5 rounded-full px-3 text-caption font-bold transition-colors disabled:opacity-50',
        ready ? 'bg-error text-white' : 'border border-border text-text-secondary hover:border-error hover:text-error',
        className,
      )}
    >
      {ready ? armed : children}
    </button>
  );
}

export function SmallButton({ onClick, children, active, disabled, title }: { onClick: () => void; children: ReactNode; active?: boolean; disabled?: boolean; title?: string }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'inline-flex min-h-[36px] items-center gap-1.5 rounded-full px-3 text-caption font-bold transition-colors disabled:opacity-40',
        active ? 'bg-secondary text-white' : 'border border-border text-text-primary hover:border-primary/60',
      )}
    >
      {children}
    </button>
  );
}

export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 rounded-xl border border-border px-3 py-2.5">
      <span className="min-w-0">
        <span className="block text-body font-semibold text-text-primary">{label}</span>
        {hint && <span className="block text-caption text-text-secondary">{hint}</span>}
      </span>
      <span className="relative mt-0.5 inline-flex flex-shrink-0">
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
        <span className="h-6 w-11 rounded-full bg-border transition-colors peer-checked:bg-success peer-focus-visible:ring-2 peer-focus-visible:ring-primary" />
        <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
      </span>
    </label>
  );
}

export function StateBadge({ state }: { state: 'live' | 'hidden' | 'scheduled' | 'ended' | 'active' | 'closed' }) {
  const tone: Record<string, string> = {
    live: 'bg-success/12 text-success',
    active: 'bg-success/12 text-success',
    scheduled: 'bg-accent/12 text-accent',
    hidden: 'bg-surface text-text-secondary border border-border',
    ended: 'bg-surface text-text-secondary border border-border',
    closed: 'bg-surface text-text-secondary border border-border',
  };
  const word: Record<string, string> = { live: 'Live', active: 'Running', scheduled: 'Scheduled', hidden: 'Hidden', ended: 'Ended', closed: 'Closed' };
  return <span className={cn('inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold', tone[state])}>{word[state]}</span>;
}

export function ErrorLine({ error }: { error: unknown }) {
  if (!error) return null;
  return <p role="alert" className="text-caption text-error">{(error as Error)?.message || 'Something went wrong. Try again.'}</p>;
}
