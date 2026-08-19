import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import {
  CAMPAIGN_DETAIL_SELECT,
  CAMPAIGN_LIST_SELECT,
  summarizeItems,
  validateCampaignItems,
} from "../_lib/campaign";
import {
  generateToken,
  isUniqueViolation,
  isUuid,
  isoDate,
  jsonError,
  normalizeCode,
  optText,
  readBody,
} from "../_lib/validate";

/* ============================================================
   /api/admin/vip/campaigns — 시크릿 캠페인 목록/생성
   ============================================================ */

/** GET — 캠페인 목록 (상품 수 집계 포함) */
export async function GET() {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const { data, error } = await auth.service
    .from("vip_campaigns")
    .select(CAMPAIGN_LIST_SELECT)
    .order("created_at", { ascending: false })
    .limit(1000);

  if (error) return jsonError("캠페인 목록을 불러오지 못했습니다.", 500);

  const campaigns = (data ?? []).map((row) => {
    const { vip_campaign_items, ...campaign } = row as Record<string, unknown> & {
      vip_campaign_items: { custom_price: number; products: { price: number } | null }[];
    };
    return { ...campaign, ...summarizeItems(vip_campaign_items) };
  });

  return NextResponse.json({ campaigns });
}

/**
 * POST — 캠페인 생성
 * { title, message?, group_id?, target_user_id?, require_code?, hero_image_url?,
 *   expires_at?, is_active?, items: [{ product_id, custom_price }] }
 * token은 서버가 자동 생성한다.
 */
export async function POST(req: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const body = await readBody(req);
  if (!body) return jsonError("잘못된 요청입니다.");

  const title = optText(body.title, 100);
  if (!title) return jsonError("캠페인 제목을 입력해 주세요. (100자 이내)");

  const message = optText(body.message, 2000);
  if (message === undefined) return jsonError("인사말은 2,000자 이내로 입력해 주세요.");

  // ---------- 대상 (없음 / 그룹 / 개별 고객 — 그룹과 고객 동시 지정 불가) ----------
  const groupId = body.group_id == null || body.group_id === "" ? null : body.group_id;
  const targetUserId =
    body.target_user_id == null || body.target_user_id === "" ? null : body.target_user_id;
  if (groupId !== null && !isUuid(groupId)) return jsonError("대상 그룹이 올바르지 않습니다.");
  if (targetUserId !== null && !isUuid(targetUserId)) {
    return jsonError("대상 고객이 올바르지 않습니다.");
  }
  if (groupId && targetUserId) {
    return jsonError("대상은 그룹과 개별 고객 중 하나만 지정할 수 있습니다.");
  }
  if (groupId) {
    const { data: group } = await auth.service
      .from("vip_groups")
      .select("id")
      .eq("id", groupId)
      .maybeSingle();
    if (!group) return jsonError("존재하지 않는 그룹입니다.", 404);
  }
  if (targetUserId) {
    const { data: profile } = await auth.service
      .from("profiles")
      .select("id")
      .eq("id", targetUserId)
      .maybeSingle();
    if (!profile) return jsonError("존재하지 않는 고객입니다.", 404);
  }

  // ---------- 추가 코드 잠금 ----------
  let requireCode: string | null = null;
  if (typeof body.require_code === "string" && body.require_code.trim() !== "") {
    const normalized = normalizeCode(body.require_code);
    if (!normalized) return jsonError("암호는 영문 대문자와 숫자만으로 4~20자를 넣어 주세요.");
    requireCode = normalized;
  }

  // ---------- 배경 사진 / 만료일 ----------
  const heroImageUrl = optText(body.hero_image_url, 600);
  if (heroImageUrl === undefined) return jsonError("배경 사진을 저장하지 못했습니다. 사진을 다시 올려 주세요.");
  if (heroImageUrl && !/^https?:\/\//.test(heroImageUrl)) {
    return jsonError("배경 사진을 저장하지 못했습니다. 사진을 다시 올려 주세요.");
  }

  const expiresAt = isoDate(body.expires_at);
  if (expiresAt === undefined) return jsonError("만료일 형식이 올바르지 않습니다.");

  // ---------- 상품 큐레이션 ----------
  const itemsResult = await validateCampaignItems(auth.service, body.items);
  if ("error" in itemsResult) return itemsResult.error;

  // ---------- 생성 (토큰 충돌 시 재시도) ----------
  const insertBase = {
    title,
    message,
    group_id: groupId,
    target_user_id: targetUserId,
    require_code: requireCode,
    hero_image_url: heroImageUrl,
    expires_at: expiresAt,
    is_active: typeof body.is_active === "boolean" ? body.is_active : true,
    created_by: auth.user.id,
  };

  let campaignId: string | null = null;
  for (let attempt = 0; attempt < 5 && !campaignId; attempt++) {
    const { data, error } = await auth.service
      .from("vip_campaigns")
      .insert({ ...insertBase, token: generateToken(12) })
      .select("id")
      .single();
    if (data) campaignId = data.id as string;
    else if (!isUniqueViolation(error)) return jsonError("캠페인 생성에 실패했습니다.", 500);
  }
  if (!campaignId) return jsonError("캠페인 생성에 실패했습니다. 다시 시도해 주세요.", 500);

  const { error: itemsError } = await auth.service
    .from("vip_campaign_items")
    .insert(itemsResult.rows.map((row) => ({ ...row, campaign_id: campaignId })));
  if (itemsError) {
    // 상품 저장 실패 시 캠페인도 되돌린다
    await auth.service.from("vip_campaigns").delete().eq("id", campaignId);
    return jsonError("캠페인 상품 저장에 실패했습니다.", 500);
  }

  const { data: detail } = await auth.service
    .from("vip_campaigns")
    .select(CAMPAIGN_DETAIL_SELECT)
    .eq("id", campaignId)
    .single();

  return NextResponse.json({ campaign: detail }, { status: 201 });
}
