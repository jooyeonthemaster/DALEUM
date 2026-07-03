import Skeleton from "@/components/shop/Skeleton";

export default function Loading() {
  return (
    <div className="space-y-14" aria-hidden>
      <div>
        <Skeleton className="h-6 w-28" />
        <div className="mt-5 space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      </div>
      <div>
        <Skeleton className="h-6 w-28" />
        <div className="mt-5 grid grid-cols-2 gap-x-3 gap-y-10 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="aspect-[4/5] w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
