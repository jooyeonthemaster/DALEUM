import type { Metadata } from "next";
import CustomersClient from "./CustomersClient";

export const metadata: Metadata = { title: "고객 관리" };

export default function AdminCustomersPage() {
  return <CustomersClient />;
}
