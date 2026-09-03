import { cn } from '@/lib/cn';

/* ── Base Skeleton ───────────────────────────────────────────────── */

interface SkeletonProps {
  className?: string;
}

function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={cn(
        'animate-skeleton-pulse rounded-xl bg-border/60',
        className,
      )}
      aria-hidden="true"
    />
  );
}

/* ── Skeleton Text (single line) ─────────────────────────────────── */

function SkeletonText({ className }: SkeletonProps) {
  return (
    <Skeleton className={cn('h-4 w-full rounded-md', className)} />
  );
}

/* ── Skeleton Card ───────────────────────────────────────────────── */

function SkeletonCard({ className }: SkeletonProps) {
  return (
    <div
      className={cn('rounded-2xl bg-card shadow-card overflow-hidden', className)}
      aria-hidden="true"
    >
      {/* Image area */}
      <Skeleton className="h-24 w-full rounded-none" />
      {/* Content */}
      <div className="px-3.5 py-2.5 flex flex-col gap-2">
        <Skeleton className="h-4 w-3/4 rounded-lg" />
        <Skeleton className="h-3.5 w-1/2 rounded-lg" />
        <Skeleton className="h-3.5 w-2/5 rounded-lg" />
        <Skeleton className="h-4 w-20 rounded-lg mt-0.5" />
      </div>
    </div>
  );
}

/* ── Skeleton Cafe Grid ──────────────────────────────────────────── */

interface SkeletonCafeGridProps {
  count?: number;
  className?: string;
}

function SkeletonCafeGrid({ count = 6, className }: SkeletonCafeGridProps) {
  return (
    <div
      className={cn(
        'grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4',
        className,
      )}
      aria-label="Loading cafés"
      aria-busy="true"
    >
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}

/* ── Skeleton Stat Card ──────────────────────────────────────────── */

function SkeletonStatCard({ className }: SkeletonProps) {
  return (
    <div
      className={cn('rounded-2xl bg-card shadow-card p-5 flex flex-col gap-3', className)}
      aria-hidden="true"
    >
      <Skeleton className="h-4 w-24 rounded-md" />
      <Skeleton className="h-8 w-32 rounded-lg" />
      <Skeleton className="h-3 w-20 rounded-md" />
    </div>
  );
}

/* ── Skeleton Booking Row ────────────────────────────────────────── */

function SkeletonBookingRow({ className }: SkeletonProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-4 rounded-2xl bg-card p-5 shadow-card',
        className,
      )}
      aria-hidden="true"
    >
      <Skeleton className="h-14 w-14 flex-shrink-0 rounded-xl" />
      <div className="flex flex-1 flex-col gap-2">
        <Skeleton className="h-4 w-3/4 rounded-md" />
        <Skeleton className="h-3 w-1/2 rounded-md" />
      </div>
      <Skeleton className="h-6 w-20 rounded-md" />
    </div>
  );
}

/* ── Skeleton Profile ────────────────────────────────────────────── */

function SkeletonProfile({ className }: SkeletonProps) {
  return (
    <div className={cn('flex flex-col gap-6', className)} aria-hidden="true">
      <div className="flex items-center gap-4">
        <Skeleton className="h-16 w-16 rounded-full flex-shrink-0" />
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton className="h-5 w-40 rounded-lg" />
          <Skeleton className="h-4 w-56 rounded-md" />
        </div>
      </div>
      <div className="flex flex-col gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}

export {
  Skeleton,
  SkeletonText,
  SkeletonCard,
  SkeletonCafeGrid,
  SkeletonStatCard,
  SkeletonBookingRow,
  SkeletonProfile,
};
