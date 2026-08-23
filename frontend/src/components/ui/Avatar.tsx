import { forwardRef, type HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

interface AvatarProps extends HTMLAttributes<HTMLDivElement> {
  src?: string | null;
  alt?: string;
  name?: string | null;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

const AVATAR_SIZES = {
  sm: 'h-8 w-8 text-caption',
  md: 'h-10 w-10 text-body-emphasis',
  lg: 'h-12 w-12 text-h4',
  xl: 'h-16 w-16 text-h2',
};

const Avatar = forwardRef<HTMLDivElement, AvatarProps>(
  ({ className, src, alt, name, size = 'md', ...props }, ref) => {
    const initials = name
      ? name
          .replace(/\(.*?\)/g, '') // strip role-suffix annotations like "(Gamer)"
          .split(' ')
          .map((part) => part.match(/[A-Za-z]/)?.[0] ?? '')
          .filter(Boolean)
          .join('')
          .slice(0, 2)
          .toUpperCase() || '?'
      : '?';

    return (
      <div
        ref={ref}
        className={cn(
          'relative flex flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-accent font-semibold text-white select-none',
          AVATAR_SIZES[size],
          className,
        )}
        {...props}
      >
        {src ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={src}
            alt={alt || name || 'Avatar'}
            className="h-full w-full object-cover"
            onError={(e) => {
              // Hide image on error to fallback to initials
              e.currentTarget.style.display = 'none';
            }}
          />
        ) : null}
        <span className={src ? 'sr-only' : undefined}>{initials}</span>
      </div>
    );
  },
);

Avatar.displayName = 'Avatar';

export { Avatar };
export type { AvatarProps };
