import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { CACHE_TAGS } from "@/lib/cache";
import { isUuid } from "@/lib/orders";
import { findDuplicateName, parseCategoryFields } from "../shared";

/* ============================================================
   PATCH  /api/admin/categories/[id] — 수정 (이름/주소/설명/이미지/노출/순서)
   DELETE /api/admin/categories/[id] — 삭제
     · ?moveTo=<카테고리 id> 를 주면 소속 상품을 그 카테고리로 옮긴 뒤 지운다.
     · 주지 않으면 예전대로 미분류가 된다(products.category_id 는 on delete set null).
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
      return NextResponse.json({ error: "이미 사용 중인 주소입니다." }, { status: 400 });
    }
  }

  // 이름 중복 — DB 에 unique 가 없어 서버가 직접 본다(POST 와 같은 이유)
  if (fields.name) {
    const { data: named } = await service.from("categories").select("id, name");
    const sameName = findDuplicateName(named, fields.name as string, id);
    if (sameName) {
      return NextResponse.json(
        { error: `'${sameName}' 카테고리가 이미 있습니다. 다른 이름을 지어 주세요.` },
        { status: 400 }
      );
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
      return NextResponse.json({ error: "이미 사용 중인 주소입니다." }, { status: 400 });
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

export async function DELETE(req: NextRequest, { params }: RouteParams) {
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

  /* 소속 상품 이사 —
     삭제하면 products.category_id 는 on delete set null 로 미분류가 된다. 그런데 관리자
     상품 목록에는 '미분류만 보기' 필터도, 여러 상품의 카테고리를 한 번에 바꾸는 수단도 없다.
     즉 7개짜리 카테고리를 지우면 상품 7개가 27개 목록 속으로 흩어져 하나씩 찾아 고쳐야 한다.
     그래서 지우기 전에 옮겨 담을 카테고리를 받아 한 번에 이동시킨다. */
  const moveTo = req.nextUrl.searchParams.get("moveTo");
  let movedCount = 0;
  if (moveTo) {
    if (!isUuid(moveTo) || moveTo === id) {
      return NextResponse.json({ error: "옮길 카테고리를 다시 골라 주세요." }, { status: 400 });
    }
    const { data: target } = await service
      .from("categories")
      .select("id")
      .eq("id", moveTo)
      .maybeSingle();
    if (!target) {
      return NextResponse.json({ error: "옮길 카테고리를 찾을 수 없습니다." }, { status: 400 });
    }
    const { data: moved, error: moveError } = await service
      .from("products")
      .update({ category_id: moveTo })
      .eq("category_id", id)
      .select("id");
    if (moveError) {
      console.error("[admin/categories] 상품 이동 실패:", moveError.message);
      return NextResponse.json(
        { error: "소속 상품을 옮기지 못했습니다. 카테고리는 그대로 두었습니다." },
        { status: 500 }
      );
    }
    movedCount = moved?.length ?? 0;
  }

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

  return NextResponse.json({ ok: true, moved: movedCount });
}
