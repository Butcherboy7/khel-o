import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';

/* ── Variants ────────────────────────────────────────────────────── */

const buttonVariants = cva(
  // Base
  [
    'inline-flex items-center justify-center gap-2 rounded-xl font-body text-btn font-medium',
    'transition-all duration-normal ease-out-expo',
    'cursor-pointer select-none',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
    'disabled:pointer-events-none disabled:opacity-40',
    'active:scale-95',
  ],
  {
    variants: {
      variant: {
        primary: [
          'bg-primary text-white',
          'hover:bg-primary-dark',
          'shadow-card hover:shadow-float',
        ],
        secondary: [
          'bg-card text-text-primary border border-border',
          'hover:bg-surface hover:border-text-secondary',
        ],
        ghost: [
          'text-text-secondary bg-transparent',
          'hover:bg-surface hover:text-text-primary',
        ],
        destructive: [
          'bg-error text-white',
          'hover:bg-red-600',
        ],
        'destructive-outline': [
          'border border-error/30 text-error bg-transparent',
          'hover:bg-error/10',
        ],
        accent: [
          'bg-accent text-white',
          'hover:opacity-90',
        ],
        outline: [
          'border border-primary text-primary bg-transparent',
          'hover:bg-primary/5',
        ],
      },
      // Touch devices get a 44px floor on every compact size (iOS HIG / WCAG
      // 2.5.5). Applied via `pointer: coarse` so mouse-driven desktop keeps the
      // dense sizing these variants were designed for — a laptop with a
      // touchscreen reports `coarse` too, which is the behaviour we want.
      size: {
        sm: 'h-9 px-3 text-caption rounded-lg [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:px-4',
        md: 'h-12 px-5',
        lg: 'h-14 px-7 text-body-emphasis rounded-2xl',
        icon: 'h-10 w-10 rounded-xl p-0 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11',
        // Keeps its 32px visual mark; the hit area is grown to 44px with a
        // transparent inset overlay so dense icon rows don't reflow on mobile.
        'icon-sm':
          'relative h-8 w-8 rounded-lg p-0 [@media(pointer:coarse)]:after:absolute [@media(pointer:coarse)]:after:left-1/2 [@media(pointer:coarse)]:after:top-1/2 [@media(pointer:coarse)]:after:h-11 [@media(pointer:coarse)]:after:w-11 [@media(pointer:coarse)]:after:-translate-x-1/2 [@media(pointer:coarse)]:after:-translate-y-1/2 [@media(pointer:coarse)]:after:content-[""]',
      },
      fullWidth: {
        true: 'w-full',
        false: '',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
      fullWidth: false,
    },
  },
);

/* ── Component ───────────────────────────────────────────────────── */

interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  isLoading?: boolean;
  loadingText?: string;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      fullWidth,
      isLoading = false,
      loadingText,
      disabled,
      children,
      ...props
    },
    ref,
  ) => {
    return (
      <button
        ref={ref}
        className={cn(buttonVariants({ variant, size, fullWidth }), className)}
        disabled={disabled || isLoading}
        aria-disabled={disabled || isLoading}
        {...props}
      >
        {isLoading && (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        )}
        {isLoading && loadingText ? loadingText : children}
      </button>
    );
  },
);

Button.displayName = 'Button';

export { Button, buttonVariants };
export type { ButtonProps };
