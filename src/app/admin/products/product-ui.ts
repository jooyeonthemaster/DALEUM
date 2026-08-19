import type { ProductStatus } from "@/lib/types";
import { PRODUCT_STATUS_LABELS } from "@/lib/admin-labels";

/* ============================================================
   관리자 카탈로그 화면 공용 라벨/톤
   (products / categories / inventory 페이지에서 사용)

   상태 이름은 여기서 짓지 않는다 — 용어 규범(lib/admin-labels)에서 가져온다.
   예전에는 이 파일이 "임시 저장"(띄어쓰기), 규범이 "임시저장" 이라 상품 목록과
   대시보드가 같은 상태를 다르게 불렀다. 색(톤)만 화면 소관으로 남긴다.
   ============================================================ */

export { PRODUCT_STATUS_LABELS };

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

/**
 * 상태별 안내 문구.
 *
 * 새 상품의 기본값이 '임시 저장' 인데 스토어는 '판매중'·'품절' 만 노출한다.
 * 사진·가격·상세를 다 채우고 등록해도 고객 화면에 아무것도 안 나타나는 이유가
 * 셀렉트 기본값이라는 걸 화면이 한마디도 알려주지 않아, 등록해 놓고 개발자를 찾는 일이 반복됐다.
 */
export { PRODUCT_STATUS_HINTS as PRODUCT_STATUS_HELP } from "@/lib/admin-labels";

/** 안내를 눈에 띄게 해야 하는 상태 — 다 채우고도 고객에게 안 보이는 두 가지 */
export const PRODUCT_STATUS_WARNS: ProductStatus[] = ["draft", "hidden"];

/**
 * 뱃지 추천 목록.
 * 서버는 뱃지를 자유 문자열 10개까지 받는데(shared.ts strArray) 화면만 3개로 막혀 있어서,
 * '설 선물' 같은 시즌 뱃지를 붙이려면 개발자가 코드를 고쳐야 했다.
 * 그래서 이 목록은 '고정 선택지' 가 아니라 **추천**이고, 화면에서 직접 입력할 수 있다.
 */
export const BADGE_OPTIONS = ["BEST", "NEW", "한정"] as const;

/**
 * 브랜드 추천 목록 — 패키지에 인쇄돼 고객에게 보이는 이름.
 * 목록에 없는 브랜드도 직접 적을 수 있어야 하므로 셀렉트가 아니라 추천으로만 쓴다.
 */
export const BRAND_SUGGESTIONS = ["마틴조", "바비지요", "밥애쏙", "칼로리시즌"] as const;

/** 공급처 추천 목록 — 관리자 식별용(고객 화면에는 나가지 않는다) */
export const SUPPLIER_SUGGESTIONS = ["자체", "수다락", "곤약닷컴"] as const;

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
