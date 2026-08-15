import type { Metadata } from "next";
import BulkInquiriesClient from "./BulkInquiriesClient";

export const metadata: Metadata = { title: "업소용·OEM 문의" };

export default function AdminBulkInquiriesPage() {
  return <BulkInquiriesClient />;
}
