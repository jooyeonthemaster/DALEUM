import type { Metadata } from "next";
import InventoryClient from "./InventoryClient";

export const metadata: Metadata = { title: "재고 관리" };

export default function AdminInventoryPage() {
  return <InventoryClient />;
}
