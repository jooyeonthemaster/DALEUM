import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
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

  return NextResponse.json({ ok: true });
}
