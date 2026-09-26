import { Skeleton, SkeletonCafeGrid } from '@/components/ui/Skeleton';

// Also covers /cafes/<city>/<activity>, which has no loading file of its own.
export default function CityLoading() {
  return (
    <div className="max-w-5xl mx-auto w-full flex flex-col gap-6 py-6" aria-busy="true" aria-label="Loading cafés">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-9 w-3/5 rounded-xl" />
        <Skeleton className="h-4 w-2/5 rounded-lg" />
      </div>
      <SkeletonCafeGrid count={6} />
    </div>
  );
}
