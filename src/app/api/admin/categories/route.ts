import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { CACHE_TAGS, VISIBLE_STATUSES } from "@/lib/cache";
import { isUuid } from "@/lib/orders";
import { findDuplicateName, parseCategoryFields } from "./shared";

/* ============================================================
   GET  /api/admin/categories — 전체 목록 (+상품 수 2종)
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
}

/**
 * GET → { categories: [{...category, product_count, visible_count}] }
 *
 * 개수를 두 벌로 내려주는 이유:
 * 전에는 `select("*, products(count)")` 하나로 세서 임시저장·숨김 상품까지 전부 포함됐다.
 * 그런데 고객 탭 숫자는 getCachedProductCounts 가 판매중·품절만 센 값이라
 * 관리자 화면의 "상품 7개" 와 고객 화면의 "0개" 가 아무 설명 없이 어긋났다.
 * (실제로 '대용량·업소용' 7개는 전부 임시저장이라 고객에겐 0개다.)
 * 그래서 여기서 두 값을 모두 만들어 화면이 "판매중 n개 / 전체 m개" 로 함께 보여 준다.
 *
 * PostgREST 로는 GROUP BY 를 표현할 수 없어 category_id·status 두 컬럼만 훑어 세운다.
 * 현재 상품 27개 기준 무시할 수 있는 비용이고, 수천 개로 늘면 집계 뷰로 옮길 것.
 */
export async function GET() {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const { service } = auth;

  const [categoryRes, productRes] = await Promise.all([
    service
      .from("categories")
      .select("*")
      .order("sort_order", { ascending: true })
      // 2차 정렬 키를 스토어(getCachedCategories)와 똑같이 slug 로 맞춘다.
      // 예전에는 여기만 created_at 이라, sort_order 동점이 생기면 관리자가 본 순서와
      // 고객 탭·홈 타일 순서가 서로 달랐다 — 순서를 고쳐도 왜 안 맞는지 알 수 없었다.
      .order("slug", { ascending: true }),
    service.from("products").select("category_id, status"),
  ]);

  if (categoryRes.error || productRes.error) {
    console.error(
      "[admin/categories] 목록 조회 실패:",
      categoryRes.error?.message ?? productRes.error?.message
    );
    return NextResponse.json({ error: "카테고리 목록을 불러오지 못했습니다." }, { status: 500 });
  }

  const visibleStatuses: readonly string[] = VISIBLE_STATUSES;
  const totalBy: Record<string, number> = {};
  const visibleBy: Record<string, number> = {};
  for (const row of (productRes.data ?? []) as { category_id: string | null; status: string }[]) {
    if (!row.category_id) continue;
    totalBy[row.category_id] = (totalBy[row.category_id] ?? 0) + 1;
    if (visibleStatuses.includes(row.status)) {
      visibleBy[row.category_id] = (visibleBy[row.category_id] ?? 0) + 1;
    }
  }

  const categories = ((categoryRes.data ?? []) as CategoryRow[]).map((c) => ({
    ...c,
    product_count: totalBy[c.id] ?? 0,
    visible_count: visibleBy[c.id] ?? 0,
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
    return NextResponse.json({ error: "이미 사용 중인 주소입니다." }, { status: 400 });
  }

  // 이름 중복은 DB 가 막아 주지 않는다(unique 는 slug 에만 있다). 막지 않으면
  // 고객 화면 탭에 '곤약밥' 이 두 개 나란히 뜨고 상품이 둘로 쪼개진다.
  const { data: named } = await service.from("categories").select("id, name");
  const sameName = findDuplicateName(named, fields.name as string, null);
  if (sameName) {
    return NextResponse.json(
      { error: `'${sameName}' 카테고리가 이미 있습니다. 다른 이름을 지어 주세요.` },
      { status: 400 }
    );
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
      return NextResponse.json({ error: "이미 사용 중인 주소입니다." }, { status: 400 });
    }
    console.error("[admin/categories] 등록 실패:", error?.message);
    return NextResponse.json({ error: "카테고리 등록에 실패했습니다." }, { status: 500 });
  }

  // 신규 카테고리는 헤더/카테고리 탭 목록에 바로 나타나야 한다.
  // (소속 상품이 아직 없으므로 products 태그는 건드리지 않는다.)
  revalidateTag(CACHE_TAGS.categories, { expire: 0 });

  return NextResponse.json({ category: created }, { status: 201 });
}

/**
 * PUT body: { order: [categoryId, ...] } — 배열 순서대로 sort_order 재부여
 *
 * 예전에는 행마다 update 를 도는 for 루프였다. 트랜잭션이 아니라 중간에 실패하면
 * 앞쪽 몇 개만 새 순서로 커밋된 채 남았고, 두 카테고리가 같은 sort_order 를 갖게 되면
 * 고객 탭 순서가 새로고침마다 달라졌다. 되돌릴 방법도 화면에 없었다.
 * 지금은 기존 행 전체를 읽어 sort_order 만 갈아 끼운 뒤 upsert **한 번**으로 보낸다 —
 * 단일 statement 라 전부 반영되거나 전부 안 되거나 둘 중 하나다.
 */
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
  const ids = order as string[];
  if (new Set(ids).size !== ids.length) {
    return NextResponse.json({ error: "잘못된 순서 정보입니다." }, { status: 400 });
  }

  const { data: existing, error: readError } = await service
    .from("categories")
    .select("*")
    .in("id", ids);

  if (readError || !existing) {
    console.error("[admin/categories] 순서 변경 전 조회 실패:", readError?.message);
    return NextResponse.json({ error: "순서를 저장하지 못했습니다." }, { status: 500 });
  }
  if (existing.length !== ids.length) {
    // 다른 창에서 카테고리를 지웠거나 새로 만든 상태다. 화면이 낡았으니 다시 받게 한다.
    return NextResponse.json(
      { error: "목록이 바뀌었습니다. 화면을 새로 고친 뒤 다시 시도해 주세요." },
      { status: 409 }
    );
  }

  const byId = new Map(existing.map((row) => [(row as CategoryRow).id, row]));
  const rows = ids.map((id, index) => ({
    ...(byId.get(id) as Record<string, unknown>),
    sort_order: index,
  }));

  const { error } = await service.from("categories").upsert(rows, { onConflict: "id" });
  if (error) {
    console.error("[admin/categories] 순서 변경 실패:", error.message);
    return NextResponse.json({ error: "순서를 저장하지 못했습니다." }, { status: 500 });
  }

  // sort_order 재부여 완료 — getCachedCategories 가 sort_order 로 정렬하므로
  // 무효화하지 않으면 헤더/탭 순서가 예전 그대로 남는다.
  revalidateTag(CACHE_TAGS.categories, { expire: 0 });

  return NextResponse.json({ ok: true });
}
