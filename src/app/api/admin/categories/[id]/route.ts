import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { CACHE_TAGS } from "@/lib/cache";
import { isUuid } from "@/lib/orders";
import { parseCategoryFields } from "../shared";

/* ============================================================
   PATCH  /api/admin/categories/[id] — 수정 (이름/slug/설명/이미지/활성/순서)
   DELETE /api/admin/categories/[id] — 삭제 (소속 상품은 미분류로 전환)
   ============================================================ */

type RouteParams = { params: Promise<{ id: string }> };

function notFound() {
  return NextResponse.json({ error: "카테고리를 찾을 수 없습니다." }, { status: 404 });
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const { service } = auth;

  const { id } = await params;
  if (!isUuid(id)) return notFound();

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });

  const { fields, error: parseError } = parseCategoryFields(body, { partial: true });
  if (parseError || !fields) {
    return NextResponse.json({ error: parseError ?? "잘못된 요청입니다." }, { status: 400 });
  }
  if (Object.keys(fields).length === 0) {
    return NextResponse.json({ error: "변경할 내용이 없습니다." }, { status: 400 });
  }

  if (fields.slug) {
    const { data: dup } = await service
      .from("categories")
      .select("id")
      .eq("slug", fields.slug as string)
      .neq("id", id)
      .maybeSingle();
    if (dup) {
      return NextResponse.json({ error: "이미 사용 중인 URL 슬러그입니다." }, { status: 400 });
    }
  }

  const { data: updated, error } = await service
    .from("categories")
    .update(fields)
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "이미 사용 중인 URL 슬러그입니다." }, { status: 400 });
    }
    console.error("[admin/categories] 수정 실패:", error.message);
    return NextResponse.json({ error: "카테고리 수정에 실패했습니다." }, { status: 500 });
  }
  if (!updated) return notFound();

  revalidateTag(CACHE_TAGS.categories, { expire: 0 });
  // 카테고리 이름·슬러그는 상품 캐시에 조인돼 함께 저장된다
  // (PRODUCT_CARD_SELECT / PRODUCT_DETAIL_SELECT 의 `categories(id, slug, name)`).
  // 그래서 표시에 영향을 주는 필드가 바뀐 경우에만 상품 캐시도 비운다 —
  // 설명·이미지·정렬만 바뀐 저장에서는 카탈로그 캐시를 살려 둔다.
  if (
    fields.name !== undefined ||
    fields.slug !== undefined ||
    fields.is_active !== undefined
  ) {
    revalidateTag(CACHE_TAGS.products, { expire: 0 });
  }

  return NextResponse.json({ category: updated });
}

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const { service } = auth;

  const { id } = await params;
  if (!isUuid(id)) return notFound();

  const { data: existing } = await service
    .from("categories")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (!existing) return notFound();

  // products.category_id는 on delete set null — 소속 상품은 미분류로 남는다
  const { error } = await service.from("categories").delete().eq("id", id);
  if (error) {
    console.error("[admin/categories] 삭제 실패:", error.message);
    return NextResponse.json({ error: "카테고리 삭제에 실패했습니다." }, { status: 500 });
  }

  // products.category_id 가 on delete set null 이라 소속 상품의 표시도 함께 바뀐다
  // (카드/상세에 조인된 categories(id, slug, name) 가 null 이 되고 카테고리별 개수도 달라진다).
  // 따라서 두 태그를 모두 무효화한다.
  revalidateTag(CACHE_TAGS.categories, { expire: 0 });
  revalidateTag(CACHE_TAGS.products, { expire: 0 });

  return NextResponse.json({ ok: true });
}
