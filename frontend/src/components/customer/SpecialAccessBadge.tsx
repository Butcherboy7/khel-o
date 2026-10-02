import { Zap } from 'lucide-react';
import { cn } from '@/lib/cn';

interface SpecialAccessBadgeProps {
  /** Locked = not earned yet: greyed out and still. */
  earned?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZES = {
  sm: { box: 'h-9 w-auto', face: 'gap-1.5 px-2.5 py-1', icon: 'h-3.5 w-3.5', name: 'text-[11px]', sub: 'hidden' },
  md: { box: 'w-full max-w-[260px]', face: 'gap-3 px-4 py-3', icon: 'h-6 w-6', name: 'text-body', sub: 'text-[11px]' },
  lg: { box: 'w-full max-w-[300px]', face: 'gap-3.5 px-5 py-4', icon: 'h-7 w-7', name: 'text-h3', sub: 'text-caption' },
} as const;

/**
 * The collectible "KHELO Special Access" badge: a dark medallion inside an
 * always-turning gold-and-red ring with a passing sheen, like a rare skin in a
 * game. Pure CSS (see .mythic in globals.css); stops for reduced motion.
 */
export function SpecialAccessBadge({ earned = true, size = 'md', className }: SpecialAccessBadgeProps) {
  const s = SIZES[size];
  return (
    <div
      className={cn('relative inline-block', s.box, className)}
      role="img"
      aria-label={earned ? 'KHELO Special Access badge' : 'KHELO Special Access badge, not earned yet'}
    >
      {earned && size !== 'sm' && <span className="mythic-glow" aria-hidden />}
      <div className={cn('mythic h-full', !earned && 'mythic-locked')}>
        <div className={cn('mythic-face flex h-full items-center', s.face)}>
          <span
            className={cn(
              'flex flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[#F59E0B] to-[#E54D42] text-white',
              size === 'sm' ? 'h-5 w-5' : size === 'md' ? 'h-10 w-10' : 'h-12 w-12',
            )}
          >
            <Zap className={cn(s.icon, 'fill-white')} aria-hidden />
          </span>
          <span className="flex min-w-0 flex-col text-left leading-tight">
            <span className={cn('font-heading font-bold text-white', s.name)}>KHELO Special Access</span>
            <span className={cn('font-semibold text-white/70', s.sub)}>{earned ? 'Limited-time campaign' : 'Join the campaign to earn it'}</span>
          </span>
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
