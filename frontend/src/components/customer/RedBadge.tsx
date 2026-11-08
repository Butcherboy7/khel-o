import { cn } from '@/lib/cn';

/** The red number (or dot) on a tab. One small pop when it appears, never a
 *  looping pulse; no motion at all if the phone asks for reduced motion. */
export function RedBadge({ count, dot = false, className }: { count?: number; dot?: boolean; className?: string }) {
  if (!dot && !count) return null;
  const label = dot ? 'Finish setting up' : `${count} new`;
  return (
    <span
      role="img"
      aria-label={label}
      className={cn(
        'khelo-badge-pop inline-flex flex-none items-center justify-center bg-[#E5322D] font-bold leading-none text-white ring-2 ring-card',
        dot ? 'h-2.5 w-2.5 rounded-full' : 'h-[18px] min-w-[18px] rounded-full px-1 text-[11px] tabular-nums',
        className,
      )}
    >
      {dot ? null : (count as number) > 9 ? '9+' : count}
    </span>
  );
}
