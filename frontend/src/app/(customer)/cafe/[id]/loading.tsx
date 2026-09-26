import { Skeleton } from '@/components/ui/Skeleton';

// Streams instantly while the server fetches the café, instead of leaving the
// previous page frozen on a slow connection.
export default function CafeLoading() {
  return (
    <div className="flex flex-col gap-6 py-4" aria-busy="true" aria-label="Loading café">
      <Skeleton className="h-64 w-full rounded-3xl sm:h-80" />
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-2/3 rounded-xl" />
        <Skeleton className="h-4 w-1/3 rounded-lg" />
      </div>
      <Skeleton className="h-24 w-full rounded-2xl" />
      <Skeleton className="h-24 w-full rounded-2xl" />
    </div>
  );
}
