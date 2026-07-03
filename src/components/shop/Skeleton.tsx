export interface SkeletonProps {
  className?: string;
}

/** cream 톤 펄스 블록 — 크기는 className으로 지정 (예: "h-4 w-40") */
export function Skeleton({ className = "" }: SkeletonProps) {
  return (
    <div aria-hidden className={`animate-pulse rounded-sm bg-cream-200 ${className}`} />
  );
}

/** ProductCard와 동일한 실루엣의 스켈레톤 */
export function ProductCardSkeleton({ className = "" }: SkeletonProps) {
  return (
    <div aria-hidden className={className}>
      <Skeleton className="aspect-[4/5] w-full" />
      <div className="pt-4">
        <Skeleton className="h-3 w-1/3" />
        <Skeleton className="mt-2.5 h-4 w-3/4" />
        <Skeleton className="mt-2 h-3 w-1/2" />
        <Skeleton className="mt-3 h-4 w-2/5" />
      </div>
    </div>
  );
}

export default Skeleton;
