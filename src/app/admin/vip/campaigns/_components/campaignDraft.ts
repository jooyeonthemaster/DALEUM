"use client";

/* ============================================================
   시크릿 캠페인 폼이 다루는 값들 — 한 파일이 500줄을 넘지 않도록
   폼 본체(CampaignForm)와 두 구역(기본 정보 / 상품 큐레이션)이
   함께 쓰는 형·규칙만 여기 모았다.
   ============================================================ */

import { VIP_BASE_PRICE_LABEL, won } from "@/lib/admin-labels";
import type { CustomerHit } from "../../_components/vipApi";

export type TargetType = "none" | "group" | "user";

export interface CampaignDraft {
  title: string;
  message: string;
  heroUrl: string | null;
  /** 'yyyy-mm-dd' — 빈 문자열이면 만료 없음 */
  expires: string;
  active: boolean;
  targetType: TargetType;
  groupId: string;
  customer: CustomerHit | null;
  requireCode: string;
}

export const EMPTY_CAMPAIGN_DRAFT: CampaignDraft = {
  title: "",
  message: "",
  heroUrl: null,
  expires: "",
  active: true,
  targetType: "none",
  groupId: "",
  customer: null,
  requireCode: "",
};

export interface ItemDraft {
  productId: string;
  name: string;
  /** products.price — 화면에서는 '기본 판매가'로 부른다 */
  price: number;
  /** products.cost_price — 원가 아래로 파는지 판단하는 데만 쓴다 */
  cost: number | null;
  /** 캠페인가 입력값 */
  value: string;
}

/** 입력한 캠페인가가 쓸 수 있는 값인지 — 쓸 수 없으면 한국어 이유 */
export function itemInvalidReason(item: ItemDraft): string | null {
  const n = Number(item.value);
  if (item.value.trim() === "" || !Number.isInteger(n) || n < 1) {
    return "캠페인가를 1원 이상의 정수로 넣어 주세요.";
  }
  if (n > item.price) {
    return `캠페인가는 ${VIP_BASE_PRICE_LABEL} ${won(item.price)}를 넘을 수 없습니다.`;
  }
  return null;
}

/** 입력값 → 금액. 아직 못 쓰는 값이면 null */
export function itemPrice(item: ItemDraft): number | null {
  return itemInvalidReason(item) === null ? Number(item.value) : null;
}
