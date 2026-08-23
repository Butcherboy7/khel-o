import { forwardRef, useId, useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/cn';

/* ── Input ───────────────────────────────────────────────────────── */

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
  leftIcon?: ReactNode;
  rightElement?: ReactNode;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className,
      label,
      hint,
      error,
      leftIcon,
      rightElement,
      id,
      disabled,
      type,
      ...props
    },
    ref,
  ) => {
    const generatedId = useId();
    const inputId = id ?? generatedId;
    const errorId = `${inputId}-error`;
    const hintId = `${inputId}-hint`;

    // Every password field in the app renders through this component — add
    // the show/hide toggle once, here, instead of duplicating it at each of
    // the six call sites (login, register, reset-password x2, accept-
    // invitation x2). Only kicks in for type="password" and only when the
    // caller hasn't already supplied a rightElement of their own.
    const [isRevealed, setIsRevealed] = useState(false);
    const isPasswordField = type === 'password';
    const resolvedType = isPasswordField && isRevealed ? 'text' : type;
    const resolvedRightElement =
      isPasswordField && !rightElement ? (
        <button
          type="button"
          onClick={() => setIsRevealed((v) => !v)}
          tabIndex={-1}
          aria-label={isRevealed ? 'Hide password' : 'Show password'}
          className="flex items-center text-text-secondary transition-colors hover:text-text-primary"
        >
          {isRevealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      ) : (
        rightElement
      );

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="text-h4 text-text-primary"
          >
            {label}
          </label>
        )}

        <div className="relative flex items-center">
          {leftIcon && (
            <span
              className="pointer-events-none absolute left-4 flex items-center text-text-secondary"
              aria-hidden="true"
            >
              {leftIcon}
            </span>
          )}

          <input
            ref={ref}
            id={inputId}
            type={resolvedType}
            disabled={disabled}
            aria-describedby={
              [error ? errorId : '', hint ? hintId : '']
                .filter(Boolean)
                .join(' ') || undefined
            }
            aria-invalid={error ? 'true' : undefined}
            className={cn(
              // Base
              'w-full rounded-xl border bg-card font-body text-body text-text-primary',
              'h-input px-4',
              'placeholder:text-text-secondary/60',
              // Transition
              'transition-colors duration-fast',
              // Border states
              'border-border',
              'focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-0 focus:border-primary',
              // Error state
              error && 'border-error focus:ring-error',
              // Disabled
              'disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-surface',
              // Icon padding
              leftIcon && 'pl-11',
              resolvedRightElement && 'pr-11',
              className,
            )}
            {...props}
          />

          {resolvedRightElement && (
            <span className="absolute right-4 flex items-center">
              {resolvedRightElement}
            </span>
          )}
        </div>

        {hint && !error && (
          <p id={hintId} className="text-caption text-text-secondary">
            {hint}
          </p>
        )}
        {error && (
          <p id={errorId} className="text-caption text-error" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  },
);

Input.displayName = 'Input';

/* ── Textarea ────────────────────────────────────────────────────── */

interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  hint?: string;
  error?: string;
}

const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, label, hint, error, id, ...props }, ref) => {
    const generatedId = useId();
    const textareaId = id ?? generatedId;
    const errorId = `${textareaId}-error`;
    const hintId = `${textareaId}-hint`;

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={textareaId} className="text-h4 text-text-primary">
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={textareaId}
          aria-describedby={
            [error ? errorId : '', hint ? hintId : '']
              .filter(Boolean)
              .join(' ') || undefined
          }
          aria-invalid={error ? 'true' : undefined}
          className={cn(
            'w-full rounded-xl border bg-card font-body text-body text-text-primary',
            'px-4 py-3 min-h-[120px] resize-y',
            'placeholder:text-text-secondary/60',
            'transition-colors duration-fast',
            'border-border focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary',
            error && 'border-error focus:ring-error',
            'disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-surface',
            className,
          )}
          {...props}
        />
        {hint && !error && (
          <p id={hintId} className="text-caption text-text-secondary">
            {hint}
          </p>
        )}
        {error && (
          <p id={errorId} className="text-caption text-error" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  },
);

Textarea.displayName = 'Textarea';

export { Input, Textarea };
export type { InputProps, TextareaProps };
