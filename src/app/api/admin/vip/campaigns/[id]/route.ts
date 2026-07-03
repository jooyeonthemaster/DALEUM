import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { CAMPAIGN_DETAIL_SELECT, validateCampaignItems } from "../../_lib/campaign";
import {
  isUuid,
  isoDate,
  jsonError,
  normalizeCode,
  optText,
  readBody,
} from "../../_lib/validate";

/* ============================================================
   /api/admin/vip/campaigns/[id] — 캠페인 상세/수정/삭제
   ============================================================ */

/** GET — 캠페인 상세 (큐레이션 상품 sort_order 순 정렬) */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const { id } = await params;
  if (!isUuid(id)) return jsonError("존재하지 않는 캠페인입니다.", 404);

  const { data, error } = await auth.service
    .from("vip_campaigns")
    .select(CAMPAIGN_DETAIL_SELECT)
    .eq("id", id)
    .maybeSingle();

  if (error) return jsonError("캠페인을 불러오지 못했습니다.", 500);
  if (!data) return jsonError("존재하지 않는 캠페인입니다.", 404);

  const items = ((data.vip_campaign_items ?? []) as { sort_order: number }[]).sort(
    (a, b) => a.sort_order - b.sort_order
  );

  return NextResponse.json({ campaign: { ...data, vip_campaign_items: items } });
}

/**
 * PATCH — 부분 수정. 보낸 필드만 바뀌며, items를 보내면 상품 구성 전체가 교체된다.
 * { title?, message?, group_id?, target_user_id?, require_code?, hero_image_url?,
 *   expires_at?, is_active?, items? }
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const { id } = await params;
  if (!isUuid(id)) return jsonError("존재하지 않는 캠페인입니다.", 404);

  const body = await readBody(req);
  if (!body) return jsonError("잘못된 요청입니다.");

  const { data: current, error: fetchError } = await auth.service
    .from("vip_campaigns")
    .select("id, group_id, target_user_id")
    .eq("id", id)
    .maybeSingle();
  if (fetchError) return jsonError("캠페인을 확인하지 못했습니다.", 500);
  if (!current) return jsonError("존재하지 않는 캠페인입니다.", 404);

  const patch: Record<string, unknown> = {};

  if ("title" in body) {
    const title = optText(body.title, 100);
    if (!title) return jsonError("캠페인 제목을 입력해 주세요. (100자 이내)");
    patch.title = title;
  }
  if ("message" in body) {
    const message = optText(body.message, 2000);
    if (message === undefined) return jsonError("인사말은 2,000자 이내로 입력해 주세요.");
    patch.message = message;
  }

  // ---------- 대상 ----------
  if ("group_id" in body) {
    const groupId = body.group_id == null || body.group_id === "" ? null : body.group_id;
    if (groupId !== null) {
      if (!isUuid(groupId)) return jsonError("대상 그룹이 올바르지 않습니다.");
      const { data: group } = await auth.service
        .from("vip_groups")
        .select("id")
        .eq("id", groupId)
        .maybeSingle();
      if (!group) return jsonError("존재하지 않는 그룹입니다.", 404);
    }
    patch.group_id = groupId;
  }
  if ("target_user_id" in body) {
    const targetUserId =
      body.target_user_id == null || body.target_user_id === "" ? null : body.target_user_id;
    if (targetUserId !== null) {
      if (!isUuid(targetUserId)) return jsonError("대상 고객이 올바르지 않습니다.");
      const { data: profile } = await auth.service
        .from("profiles")
        .select("id")
        .eq("id", targetUserId)
        .maybeSingle();
      if (!profile) return jsonError("존재하지 않는 고객입니다.", 404);
    }
    patch.target_user_id = targetUserId;
  }

  // 그룹/개별 고객 동시 지정 금지 (변경분 + 기존값 병합 기준)
  const mergedGroup = "group_id" in patch ? patch.group_id : current.group_id;
  const mergedUser = "target_user_id" in patch ? patch.target_user_id : current.target_user_id;
  if (mergedGroup && mergedUser) {
    return jsonError("대상은 그룹과 개별 고객 중 하나만 지정할 수 있습니다.");
  }

  if ("require_code" in body) {
    if (body.require_code == null || body.require_code === "") {
      patch.require_code = null;
    } else {
      const normalized = normalizeCode(body.require_code);
      if (!normalized) return jsonError("잠금 코드는 영문 대문자·숫자 4~20자로 입력해 주세요.");
      patch.require_code = normalized;
    }
  }
  if ("hero_image_url" in body) {
    const heroImageUrl = optText(body.hero_image_url, 600);
    if (heroImageUrl === undefined) return jsonError("히어로 이미지 주소가 올바르지 않습니다.");
    if (heroImageUrl && !/^https?:\/\//.test(heroImageUrl)) {
      return jsonError("히어로 이미지 주소가 올바르지 않습니다.");
    }
    patch.hero_image_url = heroImageUrl;
  }
  if ("expires_at" in body) {
    const expiresAt = isoDate(body.expires_at);
    if (expiresAt === undefined) return jsonError("만료일 형식이 올바르지 않습니다.");
    patch.expires_at = expiresAt;
  }
  if ("is_active" in body) {
    if (typeof body.is_active !== "boolean") return jsonError("잘못된 요청입니다.");
    patch.is_active = body.is_active;
  }

  // ---------- 상품 구성 교체 ----------
  let itemRows: { product_id: string; custom_price: number; sort_order: number }[] | null = null;
  if ("items" in body) {
    const itemsResult = await validateCampaignItems(auth.service, body.items);
    if ("error" in itemsResult) return itemsResult.error;
    itemRows = itemsResult.rows;
  }

  if (Object.keys(patch).length === 0 && !itemRows) return jsonError("변경할 내용이 없습니다.");

  if (Object.keys(patch).length > 0) {
    const { error } = await auth.service.from("vip_campaigns").update(patch).eq("id", id);
    if (error) return jsonError("캠페인 수정에 실패했습니다.", 500);
  }

  if (itemRows) {
    // 기존 항목은 upsert로 갱신하고, 빠진 상품만 정리한다 (전체 삭제 후 재삽입보다 안전)
    const { error: upsertError } = await auth.service
      .from("vip_campaign_items")
      .upsert(
        itemRows.map((row) => ({ ...row, campaign_id: id })),
        { onConflict: "campaign_id,product_id" }
      );
    if (upsertError) return jsonError("캠페인 상품 저장에 실패했습니다.", 500);

    const keepIds = itemRows.map((row) => row.product_id);
    const { error: pruneError } = await auth.service
      .from("vip_campaign_items")
      .delete()
      .eq("campaign_id", id)
      .not("product_id", "in", `(${keepIds.join(",")})`);
    if (pruneError) return jsonError("캠페인 상품 정리에 실패했습니다.", 500);
  }

  const { data: detail, error: detailError } = await auth.service
    .from("vip_campaigns")
    .select(CAMPAIGN_DETAIL_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (detailError || !detail) return jsonError("캠페인을 불러오지 못했습니다.", 500);

  const items = ((detail.vip_campaign_items ?? []) as { sort_order: number }[]).sort(
    (a, b) => a.sort_order - b.sort_order
  );

  return NextResponse.json({ campaign: { ...detail, vip_campaign_items: items } });
}

/** DELETE — 캠페인 삭제 (상품 구성은 cascade) */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const { id } = await params;
  if (!isUuid(id)) return jsonError("존재하지 않는 캠페인입니다.", 404);

  const { error } = await auth.service.from("vip_campaigns").delete().eq("id", id);
  if (error) return jsonError("캠페인 삭제에 실패했습니다.", 500);

  return NextResponse.json({ ok: true });
}
