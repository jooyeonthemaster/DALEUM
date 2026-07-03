import type { Metadata } from "next";
import ProductForm from "../ProductForm";

export const metadata: Metadata = { title: "새 상품 등록" };

export default function AdminProductNewPage() {
  return <ProductForm />;
}
