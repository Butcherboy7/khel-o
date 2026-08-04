import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef, type HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';
import type { BookingStatus, VerificationStatus, KycStatus } from '@/types';

/* ── Generic Badge ───────────────────────────────────────────────── */

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-md font-body text-badge font-semibold uppercase tracking-wide',
  {
    variants: {
      variant: {
        default: 'bg-surface text-text-secondary border border-border',
        primary: 'bg-primary/10 text-primary',
        accent: 'bg-accent/10 text-accent',
        success: 'bg-success/10 text-success',
        warning: 'bg-warning/10 text-warning',
        error: 'bg-error/10 text-error',
        secondary: 'bg-secondary/10 text-secondary',
      },
      size: {
        sm: 'px-1.5 py-0.5',
        md: 'px-2 py-1',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'md',
    },
  },
);

interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant, size, ...props }, ref) => (
    <span
      ref={ref}
      className={cn(badgeVariants({ variant, size }), className)}
      {...props}
    />
  ),
);
Badge.displayName = 'Badge';

/* ── BookingStatusBadge ──────────────────────────────────────────── */

const BOOKING_STATUS_CONFIG: Record<
  BookingStatus,
  { label: string; variant: VariantProps<typeof badgeVariants>['variant'] }
> = {
  pending_payment: { label: 'Payment Pending', variant: 'warning' },
  confirmed: { label: 'Confirmed', variant: 'primary' },
  checked_in: { label: 'Checked In', variant: 'success' },
  completed: { label: 'Completed', variant: 'default' },
  cancelled: { label: 'Cancelled', variant: 'error' },
  no_show: { label: 'No Show', variant: 'error' },
  failed: { label: 'Payment Failed', variant: 'error' },
};

interface BookingStatusBadgeProps {
  status: BookingStatus;
  size?: VariantProps<typeof badgeVariants>['size'];
  className?: string;
}

function BookingStatusBadge({
  status,
  size,
  className,
}: BookingStatusBadgeProps) {
  const config = BOOKING_STATUS_CONFIG[status];
  return (
    <Badge variant={config.variant} size={size} className={className}>
      {config.label}
    </Badge>
  );
}

/* ── VerificationStatusBadge ─────────────────────────────────────── */

const VERIFICATION_CONFIG: Record<
  VerificationStatus,
  { label: string; variant: VariantProps<typeof badgeVariants>['variant'] }
> = {
  pending: { label: 'Pending Review', variant: 'warning' },
  verified: { label: 'Verified', variant: 'success' },
  rejected: { label: 'Rejected', variant: 'error' },
  suspended: { label: 'Suspended', variant: 'error' },
};

interface VerificationStatusBadgeProps {
  status: VerificationStatus;
  size?: VariantProps<typeof badgeVariants>['size'];
  className?: string;
}

function VerificationStatusBadge({
  status,
  size,
  className,
}: VerificationStatusBadgeProps) {
  const config = VERIFICATION_CONFIG[status];
  return (
    <Badge variant={config.variant} size={size} className={className}>
      {config.label}
    </Badge>
  );
}

/* ── KycStatusBadge ──────────────────────────────────────────────── */

const KYC_CONFIG: Record<
  KycStatus,
  { label: string; variant: VariantProps<typeof badgeVariants>['variant'] }
> = {
  pending: { label: 'Not Started', variant: 'default' },
  submitted: { label: 'Under Review', variant: 'warning' },
  activated: { label: 'Active', variant: 'success' },
  suspended: { label: 'Suspended', variant: 'error' },
  rejected: { label: 'Rejected', variant: 'error' },
};

interface KycStatusBadgeProps {
  status: KycStatus;
  size?: VariantProps<typeof badgeVariants>['size'];
  className?: string;
}

function KycStatusBadge({ status, size, className }: KycStatusBadgeProps) {
  const config = KYC_CONFIG[status];
  return (
    <Badge variant={config.variant} size={size} className={className}>
      {config.label}
    </Badge>
  );
}

export {
  Badge,
  badgeVariants,
  BookingStatusBadge,
  VerificationStatusBadge,
  KycStatusBadge,
};
export type { BadgeProps };
