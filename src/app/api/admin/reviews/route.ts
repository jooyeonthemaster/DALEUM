import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";

/**
 * GET /api/admin/reviews — 리뷰 목록
 *
 * 쿼리:
 * - product_id: 상품 필터 (uuid)
 * - rating: 1~5 평점 필터
 * - status: all | visible | hidden | pending (답글 대기)
 * - page: 1부터 (페이지당 20건)
 *
 * 응답: { reviews, total, page, totalPages, products }
 * products = 리뷰가 달린 상품 목록 (필터 셀렉트용)
 */

const PER_PAGE = 20;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const { service } = auth;

  const sp = req.nextUrl.searchParams;
  const productId = sp.get("product_id");
  const rating = Number(sp.get("rating") ?? 0);
  const status = sp.get("status") ?? "all";
  const page = Math.max(1, Number(sp.get("page") ?? 1) || 1);

  let query = service
    .from("reviews")
    .select("*, products(id, name, slug), profiles(name, email)", { count: "exact" })
    .order("created_at", { ascending: false })
    .range((page - 1) * PER_PAGE, page * PER_PAGE - 1);

  if (productId && UUID_RE.test(productId)) query = query.eq("product_id", productId);
  if (rating >= 1 && rating <= 5) query = query.eq("rating", Math.round(rating));
  if (status === "visible") query = query.eq("is_hidden", false);
  if (status === "hidden") query = query.eq("is_hidden", true);
  if (status === "pending") query = query.is("admin_reply", null).eq("is_hidden", false);

  const [listRes, facetRes] = await Promise.all([
    query,
    // 필터용: 리뷰가 존재하는 상품 목록
    service.from("reviews").select("product_id, products(id, name)").limit(2000),
  ]);

  if (listRes.error) {
    console.error("[admin/reviews GET]", listRes.error);
    return NextResponse.json({ error: "리뷰 목록을 불러오지 못했습니다." }, { status: 500 });
  }

  const seen = new Map<string, { id: string; name: string }>();
  for (const row of facetRes.data ?? []) {
    // 다대일 임베드는 런타임에 객체로 반환된다 (untyped client는 배열로 추론)
    const p = row.products as unknown as { id: string; name: string } | null;
    if (p && !seen.has(p.id)) seen.set(p.id, p);
  }
  const products = [...seen.values()].sort((a, b) => a.name.localeCompare(b.name, "ko"));

  const total = listRes.count ?? 0;
  return NextResponse.json({
    reviews: listRes.data ?? [],
    total,
    page,
    totalPages: Math.max(1, Math.ceil(total / PER_PAGE)),
    products,
  });
}
