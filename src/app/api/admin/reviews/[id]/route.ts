import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { CACHE_TAGS } from "@/lib/cache";

/**
 * PATCH /api/admin/reviews/[id]
 *
 * body:
 * - is_hidden?: boolean         — 숨김 토글
 * - admin_reply?: string | null — 답글 저장 (빈 값/null이면 답글 삭제)
 *
 * 답글 저장 시 admin_replied_at이 갱신된다.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const { service } = auth;

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "리뷰를 찾을 수 없습니다." }, { status: 404 });
  }

  const body = (await req.json().catch(() => null)) as {
    is_hidden?: unknown;
    admin_reply?: unknown;
  } | null;
  if (!body) return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });

  const cols: Record<string, unknown> = {};

  if (body.is_hidden !== undefined) {
    cols.is_hidden = Boolean(body.is_hidden);
  }

  if (body.admin_reply !== undefined) {
    const reply = typeof body.admin_reply === "string" ? body.admin_reply.trim() : "";
    if (reply.length > 2000) {
      return NextResponse.json({ error: "답글은 2,000자 이내로 입력해 주세요." }, { status: 400 });
    }
    if (reply) {
      cols.admin_reply = reply;
      cols.admin_replied_at = new Date().toISOString();
    } else {
      cols.admin_reply = null;
      cols.admin_replied_at = null;
    }
  }

  if (Object.keys(cols).length === 0) {
    return NextResponse.json({ error: "수정할 내용이 없습니다." }, { status: 400 });
  }

  const { data, error } = await service
    .from("reviews")
    .update(cols)
    .eq("id", id)
    .select("*, products(id, name, slug), profiles(name, email)")
    .maybeSingle();

  if (error) {
    console.error("[admin/reviews/:id PATCH]", error);
    return NextResponse.json({ error: "리뷰를 수정하지 못했습니다." }, { status: 500 });
  }
  if (!data) {
    // 매칭된 행이 없으면 실제 쓰기가 없었으므로 무효화하지 않는다.
    return NextResponse.json({ error: "리뷰를 찾을 수 없습니다." }, { status: 404 });
  }

  // is_hidden 토글과 admin_reply 는 상품상세 리뷰 목록(getCachedReviews)과
  // 홈 리뷰 캐러셀(getCachedHomeReviews) 양쪽에 영향을 준다 — 둘 다 reviews 태그다.
  //
  // 두 번째 인자는 Next 16 에서 필수. { expire: 0 } = 즉시 만료.
  // "max"(stale-while-revalidate)면 신고성 리뷰를 숨긴 직후에도 그 리뷰가
  // 한 번 더 노출되므로, 숨김 처리에는 즉시 만료가 맞다.
  revalidateTag(CACHE_TAGS.reviews, { expire: 0 });

  return NextResponse.json({ review: data });
}
