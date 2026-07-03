import type { Metadata } from "next";
import DashboardClient from "./DashboardClient";

export const metadata: Metadata = { title: "대시보드" };

export default function AdminDashboardPage() {
  return <DashboardClient />;
}
