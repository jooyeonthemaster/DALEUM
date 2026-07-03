import Skeleton from "@/components/shop/Skeleton";

export default function Loading() {
  return (
    <div aria-hidden>
      <Skeleton className="h-4 w-32" />
      <Skeleton className="mt-3 h-7 w-52" />
      <Skeleton className="mt-9 h-24 w-full" />
      <div className="mt-10 space-y-3">
        {Array.from({ length: 2 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
      <div className="mt-10 grid gap-10 md:grid-cols-2">
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    </div>
  );
}
