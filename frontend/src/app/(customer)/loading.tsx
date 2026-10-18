import { Skeleton } from '@/components/ui/Skeleton';

// Shown when someone taps into the customer pages from outside them (the
// GTA 6 page, login, about): Next 14 leaves a link's loading screen out of the
// prefetch when the first differing URL segment, here (customer), has none, so
// those taps used to wait for the server. Pages inside keep their own, closer
// loading screens; this neutral one only bridges the jump in.
export default function CustomerLoading() {
  return (
    <div className="flex flex-col gap-6 py-4" aria-busy="true" aria-label="Loading">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-3/5 rounded-xl" />
        <Skeleton className="h-4 w-2/5 rounded-lg" />
      </div>
      <Skeleton className="h-48 w-full rounded-3xl" />
      <Skeleton className="h-24 w-full rounded-2xl" />
    </div>
  );
}
