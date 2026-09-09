import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface OwnerStat {
  label: string;
  value: ReactNode;
  /** Optional one-word qualifier under the number ("of 10", "today"). */
  hint?: string;
  tone?: 'neutral' | 'positive' | 'warning' | 'critical';
}

const TONE: Record<NonNullable<OwnerStat['tone']>, string> = {
  neutral: 'text-text-primary',
  positive: 'text-emerald-700',
  warning: 'text-amber-700',
  critical: 'text-rose-700',
};

/**
 * A row of headline numbers, sized for a phone first.
 *
 * The portal previously stacked these as full-width cards — three numbers ate
 * the whole opening screen and an owner had to scroll before reaching anything
 * they could act on. Side by side they read as one comparable set, which is what
 * they are, and the screen opens on today's work instead of on chrome.
 *
 * Labels sit at 12px rather than the 10px `text-overline` these used before:
 * below 12px is under the legibility floor, and these labels are the only thing
 * telling the owner what the number means.
 */
export function OwnerStatRow({
  stats,
  className,
}: {
  stats: OwnerStat[];
  className?: string;
}) {
  return (
    <dl
      className={cn(
        'grid gap-2 sm:gap-3',
        stats.length === 2 ? 'grid-cols-2' : 'grid-cols-3',
        className,
      )}
    >
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="flex flex-col gap-0.5 rounded-2xl border border-border bg-card px-3 py-3 sm:px-4"
        >
          <dt className="text-caption font-medium leading-tight text-text-secondary">
            {stat.label}
          </dt>
          <dd
            className={cn(
              'font-heading text-h2 leading-none tracking-tight sm:text-h1',
              TONE[stat.tone ?? 'neutral'],
            )}
          >
            {stat.value}
          </dd>
          {stat.hint && (
            <p className="text-caption leading-tight text-text-secondary">{stat.hint}</p>
          )}
        </div>
      ))}
    </dl>
  );
}
