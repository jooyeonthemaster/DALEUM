import type { Metadata } from "next";
import ReviewsClient from "./ReviewsClient";

export const metadata: Metadata = { title: "리뷰 관리" };

export default function AdminReviewsPage() {
  return <ReviewsClient />;
}
