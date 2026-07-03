import type { Metadata } from "next";
import CouponsClient from "./CouponsClient";

export const metadata: Metadata = { title: "쿠폰" };

export default function AdminCouponsPage() {
  return <CouponsClient />;
}
