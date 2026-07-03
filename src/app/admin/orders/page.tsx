import type { Metadata } from "next";
import OrdersClient from "./OrdersClient";

export const metadata: Metadata = { title: "주문 관리" };

export default function AdminOrdersPage() {
  return <OrdersClient />;
}
