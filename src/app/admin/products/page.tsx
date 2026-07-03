import type { Metadata } from "next";
import ProductsClient from "./ProductsClient";

export const metadata: Metadata = { title: "상품 관리" };

export default function AdminProductsPage() {
  return <ProductsClient />;
}
