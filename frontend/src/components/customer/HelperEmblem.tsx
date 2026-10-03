import { useId } from 'react';
import { cn } from '@/lib/cn';

export type HelperBadgeKey = 'day_one' | 'matchmaker' | 'local_legend';

export const HELPER_BADGE_COPY: Record<HelperBadgeKey, { title: string; earn: string; xp: number }> = {
  day_one: { title: 'Day One', earn: 'Vote for a café that isn’t on KHEL-O yet', xp: 25 },
  matchmaker: { title: 'Matchmaker', earn: 'Introduce us to a café owner', xp: 100 },
  local_legend: { title: 'Local Legend', earn: 'A café you helped goes live', xp: 500 },
};

export function isHelperBadgeKey(v: string | undefined | null): v is HelperBadgeKey {
  return v === 'day_one' || v === 'matchmaker' || v === 'local_legend';
}

const RIM: Record<HelperBadgeKey, [string, string]> = {
  day_one: ['#F3B77A', '#A5642F'],
  matchmaker: ['#FAFBFD', '#9AA0AE'],
  local_legend: ['#FFEBA8', '#C98A12'],
};

const SHIELD = 'M32 3 L58 12 V32 C58 47 47 57 32 62 C17 57 6 47 6 32 V12 Z';
const INNER = 'M32 8 L53 15 V32 C53 44 44 52 32 57 C20 52 11 44 11 32 V15 Z';

interface HelperEmblemProps {
  badge: HelperBadgeKey;
  /** Not earned yet: greyed out and still. */
  earned?: boolean;
  /** Pixel size of the shield. */
  size?: number;
  className?: string;
}

/**
 * The drawn emblem for a "helped a café join" badge: a shield with a metal rim
 * (bronze, silver, gold) around a dark face and a simple line mark. Earned
 * ones carry a soft golden halo that slowly breathes and one gentle light
 * sweep (see .emblem in globals.css); both stop for reduced motion.
 */
export function HelperEmblem({ badge, earned = true, size = 64, className }: HelperEmblemProps) {
  const uid = useId().replace(/:/g, '');
  const rim = `${uid}-rim`;
  const clip = `${uid}-clip`;
  const sheen = `${uid}-sheen`;
  const [light, dark] = RIM[badge];
  const label = `${HELPER_BADGE_COPY[badge].title} badge${earned ? '' : ', not earned yet'}`;

  return (
    <span
      role="img"
      aria-label={label}
      className={cn('emblem', earned ? 'emblem-earned' : 'emblem-locked', className)}
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden>
        <defs>
          <linearGradient id={rim} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={light} />
            {badge === 'local_legend' && <stop offset="0.5" stopColor="#F2B93B" />}
            <stop offset="1" stopColor={dark} />
          </linearGradient>
          <linearGradient id={sheen} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#fff" stopOpacity="0" />
            <stop offset="0.5" stopColor="#fff" stopOpacity="0.7" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
          <clipPath id={clip}>
            <path d={SHIELD} />
          </clipPath>
        </defs>
        <path d={SHIELD} fill={`url(#${rim})`} />
        <path d={INNER} fill="#18191E" />
        {badge === 'day_one' && (
          <>
            <rect x="19" y="24" width="26" height="17" rx="3" fill={`url(#${rim})`} />
            <path d="M19 32.5h26M32 24v8.5M25.5 32.5v8.5M38.5 32.5v8.5" stroke="#18191E" strokeWidth="1.8" />
          </>
        )}
        {badge === 'matchmaker' && (
          <>
            <circle cx="26" cy="31" r="8.5" fill="none" stroke={`url(#${rim})`} strokeWidth="3.4" />
            <circle cx="38" cy="31" r="8.5" fill="none" stroke={`url(#${rim})`} strokeWidth="3.4" />
          </>
        )}
        {badge === 'local_legend' && (
          <path
            d="M32 18 L35.6 27.2 L45.5 27.9 L37.9 34.2 L40.3 43.8 L32 38.5 L23.7 43.8 L26.1 34.2 L18.5 27.9 L28.4 27.2 Z"
            fill={`url(#${rim})`}
          />
        )}
        {earned && (
          <g clipPath={`url(#${clip})`}>
            <rect className="emblem-sweep" x="-24" y="0" width="14" height="64" fill={`url(#${sheen})`} />
          </g>
        )}
      </svg>
    </span>
  );
}
