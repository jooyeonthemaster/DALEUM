import Skeleton from "@/components/shop/Skeleton";

export default function Loading() {
  return (
    <div className="container-hall pb-24 pt-8 md:pt-12">
      <div className="grid gap-10 lg:grid-cols-2 lg:gap-16 xl:gap-24">
        <div>
          <Skeleton className="aspect-[4/5] w-full" />
          <div className="mt-3 flex gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="aspect-[4/5] w-16" />
            ))}
          </div>
        </div>
        <div>
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-4 h-8 w-3/4" />
          <Skeleton className="mt-3 h-4 w-1/2" />
          <Skeleton className="mt-8 h-8 w-40" />
          <div className="mt-6 space-y-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
          <Skeleton className="mt-8 h-11 w-full" />
          <div className="mt-6 flex gap-2">
            <Skeleton className="h-12 w-12" />
            <Skeleton className="h-12 flex-1" />
            <Skeleton className="h-12 flex-1" />
          </div>
        </div>
      </div>
    </div>
  );
}
