"use client";

import type {
  VipAccessCode,
  VipCampaign,
  VipGroup,
  VipMember,
  VipProductPrice,
} from "@/lib/types";

/* ============================================================
   VIP 관리자 클라이언트 공용 — API 타입/fetch 헬퍼/유틸
   ============================================================ */

/* ---------- API 응답 행 타입 ---------- */

export interface GroupRow extends VipGroup {
  member_count: number;
  code_count: number;
}

/** profiles / vip_groups 조인 포함 */
export type MemberRow = VipMember;

export interface CodeRow extends VipAccessCode {
  vip_groups?: Pick<VipGroup, "id" | "name"> | null;
}

export interface PriceRow extends VipProductPrice {
  products?: { id: string; name: string; price: number } | null;
  vip_groups?: { id: string; name: string } | null;
  profiles?: { id: string; name: string | null; email: string | null } | null;
}

export interface CampaignRow extends VipCampaign {
  item_count: number;
  vip_groups?: { id: string; name: string } | null;
  profiles?: { id: string; name: string | null; email: string | null } | null;
}

export interface CampaignItemDetail {
  id: string;
  product_id: string;
  custom_price: number;
  sort_order: number;
  products?: { id: string; name: string; price: number; status: string } | null;
}

export interface CampaignDetail extends Omit<CampaignRow, "item_count"> {
  vip_campaign_items: CampaignItemDetail[];
}

export interface CustomerHit {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
}

export interface ProductHit {
  id: string;
  name: string;
  price: number;
  status: string;
  image_url: string | null;
}

/* ---------- fetch 헬퍼 ---------- */

/** 관리자 API 호출 — 실패 시 서버의 한국어 error 메시지로 throw */
export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  });
  const body = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok) {
    throw new Error(body?.error ?? "요청 처리에 실패했습니다. 잠시 후 다시 시도해 주세요.");
  }
  return body as T;
}

/* ---------- 유틸 ---------- */

/** 헷갈리는 글자(O/0, I/1)를 뺀 입장 코드 생성 */
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export function generateCode(length = 8): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}

/** 클립보드 복사 — 성공 여부 반환 */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** VIP 입장 페이지 전체 URL */
export function vipEntryUrl(): string {
  return `${window.location.origin}/vip`;
}

/** 시크릿 캠페인 페이지 전체 URL */
export function campaignUrl(token: string): string {
  return `${window.location.origin}/vip/s/${token}`;
}

/** date input(yyyy-mm-dd) → 해당일 KST 00:00 ISO. 빈 값이면 null */
export function kstDayStart(date: string): string | null {
  return date ? new Date(`${date}T00:00:00+09:00`).toISOString() : null;
}

/** date input(yyyy-mm-dd) → 해당일 KST 23:59:59 ISO. 빈 값이면 null */
export function kstDayEnd(date: string): string | null {
  return date ? new Date(`${date}T23:59:59+09:00`).toISOString() : null;
}

/** ISO → date input 값 (yyyy-mm-dd, KST 기준) */
export function isoToDateInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const kst = new Date(d.getTime() + 9 * 3_600_000);
  return kst.toISOString().slice(0, 10);
}

/** 할인율 적용가 미리보기 — 서버 pricing과 동일 규칙 (10원 단위 내림) */
export function previewRatePrice(base: number, rate: number): number {
  return Math.floor((base * (100 - rate)) / 100 / 10) * 10;
}

/** 고객 표시명 — 이름 > 이메일 순 */
export function customerLabel(
  c: { name?: string | null; email?: string | null } | null | undefined
): string {
  if (!c) return "탈퇴한 고객";
  return c.name || c.email || "이름 없음";
}

/** 상품 상태 라벨 (검색 결과 표시용) */
export const PRODUCT_STATUS_LABELS: Record<string, string> = {
  draft: "임시저장",
  active: "판매중",
  sold_out: "품절",
  hidden: "숨김",
};

/* ---------- 버튼 클래스 (관리자 킷 가이드) ---------- */

export const BTN_PRIMARY =
  "bg-forest-700 px-4 py-2 text-sm text-cream-50 transition-colors hover:bg-forest-800 disabled:opacity-50";
export const BTN_GHOST =
  "border border-ink-200 bg-cream-50 px-4 py-2 text-sm text-ink-700 transition-colors hover:bg-cream-100 disabled:opacity-50";
export const BTN_DANGER =
  "bg-signal-red px-4 py-2 text-sm text-cream-50 transition-colors hover:bg-[#9c3c27] disabled:opacity-50";
