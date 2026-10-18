import { SkeletonCafeGrid } from '@/components/ui/Skeleton';

// Shown the moment someone opens or taps through to home, while the server
// fetches the café list: without it the old screen just sat there (or the
// app stayed blank) until the data came back. Mirrors the explore layout
// (header, search, chips, café grid) so nothing jumps when it fills in.
// Lives in the (home) group so it never shows on the other (customer) pages.
export default function HomeLoading() {
  return (
    <div className="flex flex-col gap-4 max-w-wide mx-auto" aria-busy="true" aria-label="Loading cafés">
      <div className="flex flex-col gap-2.5">
        <div className="h-8 w-64 max-w-full rounded-lg bg-border/60 animate-pulse" />
        <div className="h-12 w-full rounded-full bg-border/60 animate-pulse" />
        <div className="h-9 w-72 max-w-full rounded-full bg-border/60 animate-pulse" />
      </div>
      <SkeletonCafeGrid count={6} />
    </div>
  );
}
