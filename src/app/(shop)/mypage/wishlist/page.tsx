import type { Metadata } from "next";
import WishlistGrid from "@/components/mypage/WishlistGrid";

export const metadata: Metadata = { title: "위시리스트" };

export default function WishlistPage() {
  return <WishlistGrid />;
}
