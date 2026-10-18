import { Skeleton } from '@/components/ui/Skeleton';

// Instant feedback while every café and city page is fetched.
export default function BrowseLoading() {
  return (
    <div className="max-w-5xl mx-auto w-full flex flex-col gap-8 py-6" aria-busy="true" aria-label="Loading cafés">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-9 w-3/5 rounded-xl" />
        <Skeleton className="h-4 w-2/5 rounded-lg" />
      </div>
      {[0, 1].map((i) => (
        <div key={i} className="flex flex-col gap-3 border-t border-border pt-5">
          <Skeleton className="h-7 w-1/2 rounded-lg" />
          <Skeleton className="h-4 w-full rounded-lg" />
          <Skeleton className="h-4 w-4/5 rounded-lg" />
          <Skeleton className="h-4 w-3/5 rounded-lg" />
        </div>
      ))}
    </div>
  );
}
