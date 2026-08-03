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
        accent: [
          'bg-accent text-white',
          'hover:opacity-90',
        ],
        outline: [
          'border border-primary text-primary bg-transparent',
          'hover:bg-primary/5',
        ],
      },
      size: {
        sm: 'h-9 px-3 text-caption rounded-lg',
        md: 'h-12 px-5',
        lg: 'h-14 px-7 text-body-emphasis rounded-2xl',
        icon: 'h-10 w-10 rounded-xl p-0',
        'icon-sm': 'h-8 w-8 rounded-lg p-0',
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
