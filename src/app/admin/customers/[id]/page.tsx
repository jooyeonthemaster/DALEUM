import type { Metadata } from "next";
import CustomerDetailClient from "./CustomerDetailClient";

export const metadata: Metadata = { title: "고객 상세" };

export default async function AdminCustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <CustomerDetailClient customerId={id} />;
}
