import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { jsonError, sanitizeSearch } from "../_lib/validate";

/* ============================================================
   GET /api/admin/vip/products-search?q=
   상품명 검색 — 대표 이미지 포함, 최대 10개
   ============================================================ */

interface ProductRow {
  id: string;
  name: string;
  price: number;
  status: string;
  product_images: { url: string; is_primary: boolean; sort_order: number }[] | null;
}

export async function GET(req: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const raw = new URL(req.url).searchParams.get("q") ?? "";
  const q = sanitizeSearch(raw).slice(0, 50);
  if (!q) return NextResponse.json({ products: [] });

  const { data, error } = await auth.service
    .from("products")
    .select("id, name, price, status, product_images(url, is_primary, sort_order)")
    .ilike("name", `%${q}%`)
    .order("name", { ascending: true })
    .limit(10);

  if (error) return jsonError("상품 검색에 실패했습니다.", 500);

  const products = ((data ?? []) as unknown as ProductRow[]).map((p) => {
    const images = [...(p.product_images ?? [])].sort((a, b) => a.sort_order - b.sort_order);
    const primary = images.find((img) => img.is_primary) ?? images[0] ?? null;
    return {
      id: p.id,
      name: p.name,
      price: p.price,
      status: p.status,
      image_url: primary?.url ?? null,
    };
  });

  return NextResponse.json({ products });
}
