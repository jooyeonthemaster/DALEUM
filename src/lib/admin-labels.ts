/* ============================================================
   관리자 화면 용어 규범 — 같은 것을 같은 말로 부르기 위한 단일 출처

   왜 파일이 따로 필요한가:
   화면마다 제 나름의 라벨을 들고 있다가 같은 값이 다른 이름으로 불리는 일이 실제로 났다.
   · 보관 방법 room 을 상품 폼은 "실온"(lib/constants.ts), 일괄 등록은 "상온" 이라고 불렀다.
   · 더 위험한 건 "정가" 다 — 상품 폼에서는 compare_at_price(할인 전 표시가)를 뜻하는데,
     VIP 캠페인 화면에서는 product.price(실제 판매가)를 "정가" 라고 불렀다.
     같은 낱말이 서로 다른 금액을 가리키면 캠페인가를 잘못 매긴다.
   · 켜고 끄는 스위치 하나를 노출/숨김/활성/판매 활성/판매중 다섯 가지로 불렀다.

   그래서 **관리자 화면에 글자로 나가는 말은 전부 여기서 가져다 쓴다.**
   화면 안에서 문자열을 직접 짓지 마라 — 그 순간 다시 갈라진다.

   고객 화면 문구는 여기가 아니라 lib/constants.ts 소관이다(보관 방법처럼 양쪽에
   같은 말이 필요한 것은 여기서 constants 를 다시 내보내 한 벌로 유지한다).
   ============================================================ */

import { ORDER_STATUS_LABELS, STORAGE_TYPE_LABELS } from "./constants";
import type { ProductStatus, StorageType } from "./types";

/* ---------- 상품 상태 ---------- */
export const PRODUCT_STATUS_LABELS: Record<ProductStatus, string> = {
  draft: "임시저장",
  active: "판매중",
  sold_out: "품절",
  hidden: "숨김",
};

/** 상태를 고를 때 곁들이는 설명 — 무엇이 달라지는지 관리자가 알아야 한다 */
export const PRODUCT_STATUS_HINTS: Record<ProductStatus, string> = {
  draft: "고객에게 보이지 않습니다. 작성 중인 상품에 쓰세요.",
  active: "스토어에 노출되고 주문을 받습니다.",
  sold_out: "노출은 되지만 주문할 수 없습니다.",
  hidden: "스토어에서 완전히 감춥니다. 주소를 알아도 볼 수 없습니다.",
};

/* ---------- 보관 방법 ---------- */
// 고객 화면과 같은 말을 써야 한다 — 다시 정의하지 말고 그대로 내보낸다.
export { STORAGE_TYPE_LABELS };
export const STORAGE_TYPE_ORDER: StorageType[] = ["room", "chilled", "frozen"];

/* ---------- 가격 3종 ----------
   이 셋을 헷갈리면 돈이 틀린다. 화면 어디서든 아래 이름으로만 부른다. */
export const PRICE_LABELS = {
  /** products.price — 고객이 실제로 내는 금액 */
  price: "판매가",
  /** products.compare_at_price — 할인 전 표시가. 판매가보다 커야 취소선이 뜬다 */
  compareAt: "정가",
  /** products.cost_price — 매입 원가. 고객 화면에 절대 나가지 않는다 */
  cost: "원가",
} as const;

export const PRICE_HINTS = {
  price: "고객이 실제로 결제하는 금액입니다.",
  compareAt: "할인 전 가격입니다. 판매가보다 크게 넣으면 목록에 취소선과 할인율이 표시됩니다.",
  cost: "매입 단가입니다. 마진 계산에만 쓰이고 고객에게는 보이지 않습니다.",
} as const;

/**
 * VIP·캠페인 화면에서 기준이 되는 금액은 products.price 다.
 * 그 값을 "정가" 라고 부르면 상품 폼의 정가(compare_at_price)와 뒤섞인다 — 반드시 이 말을 쓴다.
 */
export const VIP_BASE_PRICE_LABEL = "기본 판매가";

/* ---------- 노출 스위치 ----------
   켜고 끄는 것은 전부 "노출" 로 통일한다. 활성/비활성/판매 활성 같은 말을 쓰지 않는다. */
export const TOGGLE_LABELS = {
  on: "노출",
  off: "숨김",
  /** 스위치 옆에 붙이는 말 */
  switch: "고객에게 노출",
} as const;

/* ---------- 자주 어긋나던 항목 이름 ---------- */
export const FIELD_LABELS = {
  /** products.slug — "URL 슬러그"·"slug" 라고 쓰지 않는다 */
  slug: "상품 주소",
  /** products.sku — 영문 약어를 그대로 쓰지 않는다 */
  sku: "상품 코드",
  /** products.sort_order */
  sortOrder: "노출 순서",
  /** products.units_per_pack */
  unitsPerPack: "한 팩 구성 수량",
  /** products.low_stock_threshold */
  lowStockThreshold: "재고 부족 기준",
  /** product_images 첫 장 */
  primaryImage: "대표 이미지",
  /** product_variants.price_delta — "가격 차액" 은 최종가를 짐작하기 어렵다 */
  priceDelta: "추가 금액",
  /** products.brand — 고객에게 보이는 브랜드 */
  brand: "브랜드",
  /** products.supplier — 관리자 전용 */
  supplier: "공급처",
  /** products.description */
  detailPage: "상세페이지",
  /** products.story */
  story: "브랜드 스토리",
  /** products.subtitle */
  subtitle: "한 줄 소개",
} as const;

export const FIELD_HINTS = {
  slug: "고객이 보는 상품 페이지 주소입니다. 영문 소문자·숫자·하이픈(-)만 쓸 수 있습니다.",
  sku: "재고를 구분하려고 회사에서 붙이는 고유 번호입니다. 없으면 비워 두세요.",
  sortOrder: "숫자가 작을수록 목록 앞쪽에 나옵니다.",
  lowStockThreshold: "재고가 이 수량 이하로 내려가면 목록에서 부족으로 표시됩니다.",
  supplier: "관리자만 보는 구분입니다. 고객 화면에는 나오지 않습니다.",
  brand: "포장에 인쇄된 브랜드입니다. 상품 페이지에 표시됩니다.",
  subtitle: "목록 카드에 함께 나오고, 검색·카카오톡 공유 시 설명으로도 쓰입니다.",
} as const;

/* ---------- 재고 변동 사유 ---------- */
export const INVENTORY_REASON_LABELS: Record<string, string> = {
  order: "주문 차감",
  cancel: "주문 취소 복구",
  restock: "입고",
  adjust: "수동 조정",
  initial: "최초 등록",
};

/* ---------- 주문 상태 ----------
   대시보드와 주문 관리가 서로 다른 이름을 쓰고 있어 여기로 모았는데, 처음에는 관리자용 이름을
   따로 지었다("입금 대기", "주문 취소"). 그러자 다른 갈라짐이 생겼다 —
   공용 칩(components/admin/StatusChip)은 고객용 constants 를 보고 있어서
   **주문 상세 한 화면 안에서 같은 상태가 두 이름으로** 불렸다.

   더 중요한 건 관리자가 고객과 통화하며 이 말을 그대로 쓴다는 점이다. 관리자 화면이
   "입금 대기" 라고 하는데 고객 화면에는 "결제 대기" 로 보이면 서로 다른 얘기를 하게 된다.
   그래서 주문 상태만큼은 **고객 화면과 같은 말**을 쓴다 — 다시 정의하지 않고 그대로 가져온다.
   (나머지 항목은 관리자 전용이라 여기서 따로 정한다) */
export { ORDER_STATUS_LABELS };

/* ---------- 할인 방식 ---------- */
export const DISCOUNT_TYPE_LABELS = {
  rate: "퍼센트 할인",
  fixed: "금액 할인",
} as const;

/* ---------- 이미지 안내 ----------
   포맷 약어(JPG·PNG·WebP)와 용량 상한만 통보하던 문구를 대신한다.
   이제 큰 사진도 브라우저가 알아서 줄여 올리므로 관리자가 신경 쓸 일이 없다. */
export const IMAGE_HELP = {
  gallery:
    "사진을 끌어다 놓으면 됩니다. 크기가 커도 알아서 줄여 올리니 원본 그대로 올리세요. 첫 번째 사진이 대표 이미지가 됩니다.",
  detail:
    "길쭉한 상세페이지 이미지는 올릴 때 알아서 나눠 담습니다. 크기가 커도 그대로 올리세요.",
  tallWarning:
    "세로로 아주 긴 사진입니다. 상품 사진 목록에 넣으면 목록 썸네일이 길게 늘어집니다. 상세페이지에 넣는 것을 권합니다.",
} as const;

/** 숫자를 사람이 읽는 금액으로 — 화면에 원화를 찍을 때 쓴다 */
export function won(value: number | null | undefined): string {
  if (value == null) return "-";
  return `${value.toLocaleString("ko-KR")}원`;
}

/** 마진액·마진율 — 원가가 없으면 null (계산할 수 없다고 화면에 말해야 한다) */
export function margin(
  price: number | null | undefined,
  cost: number | null | undefined
): { amount: number; rate: number } | null {
  if (price == null || cost == null || price <= 0) return null;
  const amount = price - cost;
  return { amount, rate: (amount / price) * 100 };
}

/** 정가 대비 할인율 — 정가가 판매가보다 커야 의미가 있다 */
export function discountRate(
  price: number | null | undefined,
  compareAt: number | null | undefined
): number | null {
  if (price == null || compareAt == null || compareAt <= price) return null;
  return ((compareAt - price) / compareAt) * 100;
}
