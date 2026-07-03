import type { Metadata } from "next";
import ProductForm from "../ProductForm";

export const metadata: Metadata = { title: "상품 편집" };

export default async function AdminProductEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ProductForm productId={id} />;
}
