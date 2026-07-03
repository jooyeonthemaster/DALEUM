import type { Metadata } from "next";
import { Suspense } from "react";
import Skeleton from "@/components/shop/Skeleton";
import ReviewsClient from "@/components/mypage/ReviewsClient";

export const metadata: Metadata = { title: "나의 리뷰" };

function ReviewsSkeleton() {
  return (
    <div aria-hidden>
      <Skeleton className="h-6 w-24" />
      <Skeleton className="mt-6 h-10 w-64" />
      <div className="mt-6 space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    </div>
  );
}

export default function ReviewsPage() {
  return (
    <Suspense fallback={<ReviewsSkeleton />}>
      <ReviewsClient />
    </Suspense>
  );
}
