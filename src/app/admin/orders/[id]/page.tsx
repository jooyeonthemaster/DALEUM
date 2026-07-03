import type { Metadata } from "next";
import OrderDetailClient from "./OrderDetailClient";

export const metadata: Metadata = { title: "주문 상세" };

export default async function AdminOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <OrderDetailClient orderId={id} />;
}
