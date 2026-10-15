import { ChevronRight, Flag } from 'lucide-react';
import { cn } from '@/lib/cn';

/** The collectible's name. The key and campaign behind it are still special_access. */
export const OG_BADGE_NAME = 'Day One';

interface SpecialAccessBadgeProps {
  /** Locked = not earned yet: greyed out and still. */
  earned?: boolean;
  size?: 'sm' | 'md' | 'lg';
  /** Shows a › so it reads as tappable (the parent supplies the button). */
  tappable?: boolean;
  className?: string;
}

const SIZES = {
  sm: { box: 'h-auto w-auto', face: 'gap-2 py-1 pl-1.5 pr-2.5', icon: 'h-3 w-3', name: 'text-[11px] whitespace-nowrap', sub: 'text-[9px] uppercase tracking-[0.06em] whitespace-nowrap' },
  md: { box: 'w-full max-w-[260px]', face: 'gap-3 px-4 py-3', icon: 'h-6 w-6', name: 'text-body', sub: 'text-[11px] uppercase tracking-[0.06em]' },
  lg: { box: 'w-full max-w-[300px]', face: 'gap-3.5 px-5 py-4', icon: 'h-7 w-7', name: 'text-h3', sub: 'text-[11px] uppercase tracking-[0.06em]' },
} as const;

/**
 * The collectible OG badge ("Day One", earned by joining the first campaign): a dark medallion inside an
 * always-turning gold-and-red ring with a passing sheen, like a rare skin in a
 * game. Pure CSS (see .mythic in globals.css); stops for reduced motion.
 */
export function SpecialAccessBadge({ earned = true, size = 'md', tappable = false, className }: SpecialAccessBadgeProps) {
  const s = SIZES[size];
  return (
    <div
      className={cn('relative inline-block', s.box, className)}
      role="img"
      aria-label={earned ? `${OG_BADGE_NAME} OG badge` : `${OG_BADGE_NAME} OG badge, not earned yet`}
    >
      {earned && size !== 'sm' && <span className="mythic-glow" aria-hidden />}
      <div className={cn('mythic h-full', !earned && 'mythic-locked')}>
        <div className={cn('mythic-face flex h-full items-center', s.face)}>
          <span
            className={cn(
              'flex flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[#F59E0B] to-[#E54D42] text-white',
              size === 'sm' ? 'h-6 w-6' : size === 'md' ? 'h-10 w-10' : 'h-12 w-12',
            )}
          >
            <Flag className={cn(s.icon, 'fill-white')} aria-hidden />
          </span>
          <span className="flex min-w-0 flex-col text-left leading-tight">
            <span className={cn('font-heading font-bold text-white', s.name)}>{OG_BADGE_NAME}</span>
            <span className={cn('font-semibold text-white/70', earned ? s.sub : 'text-[11px]')}>{earned ? 'OG · since day 1' : 'Join the campaign to earn it'}</span>
          </span>
          {tappable && <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 text-white/60" aria-hidden />}
          <span className="mythic-sheen" aria-hidden />
          {earned && size !== 'sm' && (
            <>
              <span className="mythic-spark" style={{ top: '18%', right: '14%', animationDelay: '0s' }} aria-hidden />
              <span className="mythic-spark" style={{ bottom: '20%', right: '30%', animationDelay: '0.8s' }} aria-hidden />
              <span className="mythic-spark" style={{ top: '30%', right: '46%', animationDelay: '1.5s' }} aria-hidden />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
