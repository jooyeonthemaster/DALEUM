import type { Metadata } from "next";
import AddressBook from "@/components/mypage/AddressBook";

export const metadata: Metadata = { title: "배송지 관리" };

export default function AddressesPage() {
  return <AddressBook />;
}
