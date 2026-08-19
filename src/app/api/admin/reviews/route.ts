import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";

/**
 * GET /api/admin/reviews — 리뷰 목록
 *
 * 쿼리:
 * - product_id: 상품 필터 (uuid)
 * - rating: 1~5 평점 필터
 * - status: all | visible | hidden | pending (답글 대기)
 * - q: 리뷰 내용 검색
 * - page: 1부터 (페이지당 20건)
 *
 * 응답: { reviews, total, page, totalPages, products, counts }
 * products = 리뷰가 달린 상품 목록 (필터 셀렉트용)
 * counts   = 탭에 붙일 건수 { all, pending, hidden } — 지금 걸린 상품·평점·검색 조건 기준.
 *            건수가 없으면 대표는 답글이 밀린 리뷰가 있는지 탭을 하나씩 눌러 봐야 안다.
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
  const q = (sp.get("q") ?? "").replace(/[,()%]/g, "").trim().slice(0, 50);
  const page = Math.max(1, Number(sp.get("page") ?? 1) || 1);

  // 상품·평점·검색 조건은 목록과 탭 건수에 똑같이 걸려야 한다.
  // (조건이 다르면 '답글 대기 3' 을 눌렀는데 1건만 나오는 일이 생긴다)
  const pid = productId && UUID_RE.test(productId) ? productId : null;
  const stars = rating >= 1 && rating <= 5 ? Math.round(rating) : null;

  let query = service
    .from("reviews")
    .select("*, products(id, name, slug), profiles(name, email)", { count: "exact" })
    .order("created_at", { ascending: false })
    // 같은 시각에 들어온 리뷰가 여러 건이면 정렬 순서가 조회마다 달라진다.
    // 그러면 2쪽으로 넘길 때 같은 리뷰가 또 나오거나 어떤 리뷰는 아예 건너뛴다 —
    // 답글을 빠뜨리지 않으려고 보는 화면에서 가장 있어서는 안 되는 일이라 id 로 순서를 고정한다.
    .order("id", { ascending: false })
    .range((page - 1) * PER_PAGE, page * PER_PAGE - 1);

  if (pid) query = query.eq("product_id", pid);
  if (stars) query = query.eq("rating", stars);
  if (q) query = query.ilike("content", `%${q}%`);
  if (status === "visible") query = query.eq("is_hidden", false);
  if (status === "hidden") query = query.eq("is_hidden", true);
  if (status === "pending") query = query.is("admin_reply", null).eq("is_hidden", false);

  const countQuery = () => {
    let c = service.from("reviews").select("id", { count: "exact", head: true });
    if (pid) c = c.eq("product_id", pid);
    if (stars) c = c.eq("rating", stars);
    if (q) c = c.ilike("content", `%${q}%`);
    return c;
  };

  const [listRes, facetRes, allCount, pendingCount, hiddenCount] = await Promise.all([
    query,
    // 필터용: 리뷰가 존재하는 상품 목록
    service.from("reviews").select("product_id, products(id, name)").limit(2000),
    countQuery(),
    countQuery().is("admin_reply", null).eq("is_hidden", false),
    countQuery().eq("is_hidden", true),
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
    counts: {
      all: allCount.count ?? 0,
      pending: pendingCount.count ?? 0,
      hidden: hiddenCount.count ?? 0,
    },
  });
}
