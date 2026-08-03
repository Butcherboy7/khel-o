import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

/* ── Card ────────────────────────────────────────────────────────── */

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Elevation level. Defaults to 'resting' (shadow-card). */
  elevation?: 'flat' | 'resting' | 'raised';
  /** When true, adds hover lift + cursor-pointer. Use for clickable cards. */
  interactive?: boolean;
}

const Card = forwardRef<HTMLDivElement, CardProps>(
  (
    { className, elevation = 'resting', interactive = false, ...props },
    ref,
  ) => {
    return (
      <div
        ref={ref}
        className={cn(
          'rounded-2xl bg-card',
          // Elevation
          elevation === 'flat' && 'border border-border',
          elevation === 'resting' && 'shadow-card',
          elevation === 'raised' && 'shadow-float',
          // Interactive states
          interactive && [
            'cursor-pointer transition-all duration-normal ease-out-expo',
            'hover:-translate-y-0.5 hover:shadow-float active:scale-[0.99] active:shadow-card',
          ],
          className,
        )}
        {...props}
      />
    );
  },
);

Card.displayName = 'Card';

/* ── CardHeader ──────────────────────────────────────────────────── */

const CardHeader = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('flex flex-col gap-1 p-5 pb-0', className)}
      {...props}
    />
  ),
);
CardHeader.displayName = 'CardHeader';

/* ── CardTitle ───────────────────────────────────────────────────── */

const CardTitle = forwardRef<
  HTMLHeadingElement,
  HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn('font-heading text-h3 text-text-primary', className)}
    {...props}
  />
));
CardTitle.displayName = 'CardTitle';

/* ── CardDescription ─────────────────────────────────────────────── */

const CardDescription = forwardRef<
  HTMLParagraphElement,
  HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn('text-body text-text-secondary', className)}
    {...props}
  />
));
CardDescription.displayName = 'CardDescription';

/* ── CardContent ─────────────────────────────────────────────────── */

const CardContent = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('p-5', className)} {...props} />
  ),
);
CardContent.displayName = 'CardContent';

/* ── CardFooter ──────────────────────────────────────────────────── */

const CardFooter = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'flex items-center gap-3 border-t border-border px-5 py-4',
        className,
      )}
      {...props}
    />
  ),
);
CardFooter.displayName = 'CardFooter';

/* ── CardImage ───────────────────────────────────────────────────── */

interface CardImageProps extends HTMLAttributes<HTMLDivElement> {
  /** Aspect ratio class e.g. aspect-video, aspect-[4/3] */
  aspectClass?: string;
  children?: ReactNode;
}

const CardImage = forwardRef<HTMLDivElement, CardImageProps>(
  ({ className, aspectClass = 'aspect-video', children, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'overflow-hidden rounded-t-2xl bg-surface',
        aspectClass,
        className,
      )}
      {...props}
    >
      {children}
    </div>
  ),
);
CardImage.displayName = 'CardImage';

export {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  CardImage,
};
export type { CardProps };
