import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { CACHE_TAGS } from "@/lib/cache";
import { isUuid } from "@/lib/orders";
import { parseCategoryFields } from "./shared";

/* ============================================================
   GET  /api/admin/categories — 전체 목록 (+상품 수)
   POST /api/admin/categories — 신규 등록
   PUT  /api/admin/categories — 순서 일괄 변경 { order: [id, ...] }
   ============================================================ */

interface CategoryRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  image_url: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  products: { count: number }[] | null;
}

/** GET → { categories: [{...category, product_count}] } */
export async function GET() {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const { service } = auth;

  const { data, error } = await service
    .from("categories")
    .select("*, products(count)")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[admin/categories] 목록 조회 실패:", error.message);
    return NextResponse.json({ error: "카테고리 목록을 불러오지 못했습니다." }, { status: 500 });
  }

  const categories = ((data ?? []) as CategoryRow[]).map(({ products, ...c }) => ({
    ...c,
    product_count: products?.[0]?.count ?? 0,
  }));

  return NextResponse.json({ categories });
}

/** POST body: { name, slug, description?, image_url?, is_active? } → 201 { category } */
export async function POST(req: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const { service } = auth;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });

  const { fields, error: parseError } = parseCategoryFields(body, { partial: false });
  if (parseError || !fields) {
    return NextResponse.json({ error: parseError ?? "잘못된 요청입니다." }, { status: 400 });
  }

  const { data: dup } = await service
    .from("categories")
    .select("id")
    .eq("slug", fields.slug as string)
    .maybeSingle();
  if (dup) {
    return NextResponse.json({ error: "이미 사용 중인 URL 슬러그입니다." }, { status: 400 });
  }

  // 맨 뒤 순서로 추가
  const { data: last } = await service
    .from("categories")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  fields.sort_order = ((last?.sort_order as number | undefined) ?? -1) + 1;

  const { data: created, error } = await service
    .from("categories")
    .insert(fields)
    .select("*")
    .single();

  if (error || !created) {
    if (error?.code === "23505") {
      return NextResponse.json({ error: "이미 사용 중인 URL 슬러그입니다." }, { status: 400 });
    }
    console.error("[admin/categories] 등록 실패:", error?.message);
    return NextResponse.json({ error: "카테고리 등록에 실패했습니다." }, { status: 500 });
  }

  // 신규 카테고리는 헤더/카테고리 탭 목록에 바로 나타나야 한다.
  // (소속 상품이 아직 없으므로 products 태그는 건드리지 않는다.)
  revalidateTag(CACHE_TAGS.categories, { expire: 0 });

  return NextResponse.json({ category: created }, { status: 201 });
}

/** PUT body: { order: [categoryId, ...] } — 배열 순서대로 sort_order 재부여 */
export async function PUT(req: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const { service } = auth;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const order = body?.order;
  if (!Array.isArray(order) || order.length === 0 || !order.every((id) => isUuid(id))) {
    return NextResponse.json({ error: "잘못된 순서 정보입니다." }, { status: 400 });
  }
  if (order.length > 200) {
    return NextResponse.json({ error: "순서 정보가 너무 많습니다." }, { status: 400 });
  }

  for (const [i, id] of (order as string[]).entries()) {
    const { error } = await service.from("categories").update({ sort_order: i }).eq("id", id);
    if (error) {
      console.error("[admin/categories] 순서 변경 실패:", error.message);
      // 이 루프는 트랜잭션이 아니라 여기까지의 반복분은 이미 커밋돼 있다.
      // 실패로 빠져나가더라도 캐시를 비워 화면과 DB 를 어긋난 채로 두지 않는다.
      revalidateTag(CACHE_TAGS.categories, { expire: 0 });
      return NextResponse.json({ error: "순서 변경에 실패했습니다." }, { status: 500 });
    }
  }

  // sort_order 재부여 완료 — getCachedCategories 가 sort_order 로 정렬하므로
  // 무효화하지 않으면 헤더/탭 순서가 예전 그대로 남는다.
  revalidateTag(CACHE_TAGS.categories, { expire: 0 });

  return NextResponse.json({ ok: true });
}
