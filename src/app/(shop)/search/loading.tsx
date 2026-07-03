import Skeleton, { ProductCardSkeleton } from "@/components/shop/Skeleton";

export default function Loading() {
  return (
    <div className="container-hall pb-16 pt-10 md:pb-28 md:pt-16">
      <Skeleton className="h-3 w-16" />
      <Skeleton className="mt-4 h-9 w-64" />
      <div className="hairline-b mt-6 pb-5">
        <Skeleton className="h-4 w-40" />
      </div>
      <div className="mt-8 grid grid-cols-2 gap-x-3 gap-y-10 md:grid-cols-3 md:gap-x-4 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <ProductCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
