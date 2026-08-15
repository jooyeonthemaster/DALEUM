import type {
  BulkInquiryPurpose,
  BulkInquiryStatus,
  OrderStatus,
  PaymentStatus,
  ShipmentStatus,
  StorageType,
} from "./types";

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending: "결제 대기",
  paid: "결제 완료",
  preparing: "상품 준비중",
  shipped: "배송중",
  delivered: "배송 완료",
  confirmed: "구매 확정",
  cancelled: "취소됨",
  refund_requested: "환불 요청",
  refunded: "환불 완료",
};

/** 관리자 UI 상태 색 (forest/브랜드 톤 유지) */
export const ORDER_STATUS_TONES: Record<OrderStatus, string> = {
  pending: "bg-cream-200 text-ink-600",
  paid: "bg-forest-100 text-forest-800",
  preparing: "bg-forest-100 text-forest-700",
  shipped: "bg-forest-600 text-cream-50",
  delivered: "bg-forest-900 text-cream-50",
  confirmed: "bg-forest-950 text-cream-50",
  cancelled: "bg-ink-100 text-ink-500",
  refund_requested: "bg-[#f6e8e3] text-signal-red",
  refunded: "bg-ink-200 text-ink-600",
};

/** 관리자가 직접 변경 가능한 상태 (취소/환불은 환불 API 경유) */
export const ADMIN_SETTABLE_STATUSES: OrderStatus[] = [
  "pending",
  "paid",
  "preparing",
  "shipped",
  "delivered",
  "confirmed",
];

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  ready: "결제 대기",
  paid: "승인 완료",
  cancelled: "결제 취소",
  partial_refunded: "부분 환불",
  refunded: "전액 환불",
  failed: "결제 실패",
};

export const SHIPMENT_STATUS_LABELS: Record<ShipmentStatus, string> = {
  ready: "발송 준비",
  in_transit: "배송중",
  delivered: "배송 완료",
};

export const STORAGE_TYPE_LABELS: Record<StorageType, string> = {
  room: "실온",
  chilled: "냉장",
  frozen: "냉동",
};

/* ---------- 택배사 ---------- */

export interface Carrier {
  code: string;
  name: string;
  /** 운송장 번호 형식 */
  pattern: RegExp;
  trackingUrl: (no: string) => string;
}

export const CARRIERS: Carrier[] = [
  {
    code: "kr.cjlogistics",
    name: "CJ대한통운",
    pattern: /^\d{10,12}$/,
    trackingUrl: (no) => `https://trace.cjlogistics.com/next/tracking.html?wblNo=${no}`,
  },
  {
    code: "kr.lotte",
    name: "롯데택배",
    pattern: /^\d{10,12}$/,
    trackingUrl: (no) =>
      `https://www.lotteglogis.com/home/reservation/tracking/linkView?InvNo=${no}`,
  },
  {
    code: "kr.hanjin",
    name: "한진택배",
    pattern: /^\d{10,12}$/,
    trackingUrl: (no) =>
      `https://www.hanjin.com/kor/CMS/DeliveryMgr/WaybillResult.do?mCode=MN038&schLang=KR&wblnumText2=${no}`,
  },
  {
    code: "kr.epost",
    name: "우체국택배",
    pattern: /^\d{13}$/,
    trackingUrl: (no) =>
      `https://service.epost.go.kr/trace.RetrieveDomRigiTraceList.comm?sid1=${no}`,
  },
  {
    code: "kr.logen",
    name: "로젠택배",
    pattern: /^\d{11}$/,
    trackingUrl: (no) => `https://www.ilogen.com/web/personal/trace/${no}`,
  },
];

export function getCarrier(code: string): Carrier | undefined {
  return CARRIERS.find((c) => c.code === code);
}

export function normalizeTrackingNo(input: string): string {
  return input.replace(/[\s-]/g, "");
}

export function isValidTrackingNo(carrierCode: string, no: string): boolean {
  const carrier = getCarrier(carrierCode);
  if (!carrier) return false;
  return carrier.pattern.test(normalizeTrackingNo(no));
}

/* ---------- 브랜드/회사 정보 ---------- */

export const COMPANY = {
  name: "주식회사 다름",
  nameEn: "DALEUM Co., Ltd.",
  brand: "다름",
  retailBrand: "마틴조",
  ceo: "조중규",
  bizNo: "586-87-01315",
  mailOrderNo: "제2021-고양일산동-2812호",
  bizInfoUrl: "https://www.ftc.go.kr/bizCommPop.do?wrkr_no=5868701315",
  address: "경기도 고양시 일산동구 동국로 194, 지층 (식사동)",
  tel: "031-963-3375",
  fax: "031-964-3375",
  email: "hunyeon88@daleum.kr",
  csHours: "평일 10:00 – 17:00 (점심 12:00 – 13:00)",
  /** 개인정보 보호책임자 (개인정보 보호법 제31조) */
  privacyOfficer: {
    name: "이지안",
    role: "개인정보 보호책임자",
    dept: "고객지원팀",
    phone: "010-9983-0666",
    email: "hunyeon88@daleum.kr",
  },
  slogan: "곤약 그 이상의 한계를 발효로 완성하다.",
  certifications: ["HACCP", "FSSC 22000", "VEGAN", "HALAL", "특허 2건", "연구개발전담부서"],
} as const;

/* ---------- 결제 ---------- */

export const TOSS_CLIENT_KEY = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY ?? "";

/* ---------- VIP 세션 쿠키 ---------- */

export const VIP_CODE_COOKIE = "daleum_vip_code";

/* ---------- 업소용·OEM 견적 문의 ---------- */

export const BULK_INQUIRY_STATUS_LABELS: Record<BulkInquiryStatus, string> = {
  new: "신규 접수",
  contacted: "연락 완료",
  quoted: "견적 발송",
  closed: "종결",
  spam: "스팸",
};

export const BULK_INQUIRY_STATUS_TONES: Record<BulkInquiryStatus, string> = {
  new: "bg-forest-600 text-cream-50",
  contacted: "bg-forest-100 text-forest-800",
  quoted: "bg-forest-900 text-cream-50",
  closed: "bg-ink-100 text-ink-500",
  spam: "bg-ink-200 text-ink-500",
};

export const BULK_INQUIRY_PURPOSE_LABELS: Record<BulkInquiryPurpose, string> = {
  oem: "OEM·ODM 생산",
  raw_material: "원료 납품",
  wholesale: "도매·유통",
  sample: "샘플 요청",
  etc: "기타",
};

/** 문의 폼 셀렉트 순서 */
export const BULK_INQUIRY_PURPOSES: BulkInquiryPurpose[] = [
  "oem",
  "raw_material",
  "wholesale",
  "sample",
  "etc",
];
