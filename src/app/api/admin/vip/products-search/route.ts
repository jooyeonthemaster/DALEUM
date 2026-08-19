import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { jsonError, sanitizeSearch } from "../_lib/validate";

/* ============================================================
   GET /api/admin/vip/products-search?q=&category_id=&page=&page_size=

   왜 고쳤나:
   예전에는 검색어가 없으면 빈 배열을 돌려주고, 있어도 10건에서 잘랐다.
   그래서 캠페인·전용가에 상품을 담으려면 상품명을 정확히 기억해 한 건씩
   검색해 넣는 수밖에 없었다(27개 중 20개짜리 기획전은 사실상 불가능했다).
   이제 검색어 없이도 전부 훑어볼 수 있게 하고, 페이지 단위로 끊어 준다.

   원가(cost_price)도 함께 싣는다 — 관리자가 캠페인가를 손으로 찍을 때
   그 값이 원가 아래인지 화면에서 알 수 없어 팔수록 손해 나는 값을 넣을 수 있었다.
   고객 화면으로는 절대 나가지 않는 값이므로 관리자 API 에서만 다룬다.
   ============================================================ */

interface ProductRow {
  id: string;
  name: string;
  price: number;
  cost_price: number | null;
  status: string;
  category_id: string | null;
  product_images: { url: string; is_primary: boolean; sort_order: number }[] | null;
}

const DEFAULT_PAGE_SIZE = 30;
const MAX_PAGE_SIZE = 100;

/** 1 이상의 정수로 읽는다 — 잘못된 값이면 기본값 */
function readInt(raw: string | null, fallback: number, max: number): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) return fallback;
  return Math.min(n, max);
}

export async function GET(req: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const params = new URL(req.url).searchParams;
  const q = sanitizeSearch(params.get("q") ?? "").slice(0, 50);
  const categoryId = params.get("category_id") ?? "";
  const page = readInt(params.get("page"), 1, 1000);
  const pageSize = readInt(params.get("page_size"), DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const from = (page - 1) * pageSize;

  let query = auth.service
    .from("products")
    .select("id, name, price, cost_price, status, category_id, product_images(url, is_primary, sort_order)", {
      count: "exact",
    })
    .order("name", { ascending: true })
    .range(from, from + pageSize - 1);

  if (q) query = query.ilike("name", `%${q}%`);
  if (categoryId) query = query.eq("category_id", categoryId);

  const { data, error, count } = await query;

  if (error) {
    // 개발자용 원문은 서버 로그로만 — 화면에는 사람 말만 나간다
    console.error("[admin/vip/products-search]", error.message);
    return jsonError("상품 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.", 500);
  }

  const products = ((data ?? []) as unknown as ProductRow[]).map((p) => {
    const images = [...(p.product_images ?? [])].sort((a, b) => a.sort_order - b.sort_order);
    const primary = images.find((img) => img.is_primary) ?? images[0] ?? null;
    return {
      id: p.id,
      name: p.name,
      price: p.price,
      cost_price: p.cost_price,
      status: p.status,
      category_id: p.category_id,
      image_url: primary?.url ?? null,
    };
  });

  return NextResponse.json({
    products,
    total: count ?? products.length,
    page,
    page_size: pageSize,
  });
}
