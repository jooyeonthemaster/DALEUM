import Skeleton, { ProductCardSkeleton } from "@/components/shop/Skeleton";

export default function Loading() {
  return (
    <div className="container-hall pb-24 pt-10 md:pb-32 md:pt-16">
      <Skeleton className="h-3 w-48" />
      <Skeleton className="mt-4 h-9 w-52" />
      <div className="hairline-b mt-10 pb-3.5">
        <div className="flex gap-7">
          <Skeleton className="h-4 w-14" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-20" />
        </div>
      </div>
      <div className="mt-5 flex items-center justify-between">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-4 w-20" />
      </div>
      <div className="mt-8 grid grid-cols-2 gap-x-3 gap-y-10 md:grid-cols-3 md:gap-x-4 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <ProductCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
