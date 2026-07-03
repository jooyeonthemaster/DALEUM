import type { ProductStatus } from "@/lib/types";

/* ============================================================
   관리자 카탈로그 화면 공용 라벨/톤
   (products / categories / inventory 페이지에서 사용)
   ============================================================ */

export const PRODUCT_STATUS_LABELS: Record<ProductStatus, string> = {
  draft: "임시 저장",
  active: "판매중",
  sold_out: "품절",
  hidden: "숨김",
};

/** 상태 셀렉트/칩 색 — forest 브랜드 톤 유지 */
export const PRODUCT_STATUS_TONES: Record<ProductStatus, string> = {
  draft: "text-ink-500",
  active: "text-forest-700",
  sold_out: "text-signal-amber",
  hidden: "text-ink-400",
};

export const PRODUCT_STATUS_OPTIONS = Object.entries(PRODUCT_STATUS_LABELS) as [
  ProductStatus,
  string,
][];

/** 뱃지 멀티 토글 옵션 */
export const BADGE_OPTIONS = ["BEST", "NEW", "한정"] as const;

/** inventory_logs.reason 라벨 */
export const INVENTORY_REASON_LABELS: Record<string, string> = {
  order: "주문 출고",
  cancel: "취소 복구",
  restock: "입고",
  adjust: "조정",
  initial: "최초 등록",
};

/** 공용 버튼 클래스 (관리자 킷 가이드) */
export const BTN_PRIMARY =
  "bg-forest-700 px-4 py-2.5 text-sm text-cream-50 transition-colors hover:bg-forest-800 disabled:opacity-50";
export const BTN_GHOST =
  "border border-ink-200 bg-cream-50 px-4 py-2.5 text-sm text-ink-700 transition-colors hover:bg-cream-100 disabled:opacity-50";
export const BTN_DANGER =
  "bg-signal-red px-4 py-2.5 text-sm text-cream-50 transition-colors hover:bg-[#9c3c27] disabled:opacity-50";
