import type { Metadata } from "next";
import CategoriesClient from "./CategoriesClient";

export const metadata: Metadata = { title: "카테고리 관리" };

export default function AdminCategoriesPage() {
  return <CategoriesClient />;
}
