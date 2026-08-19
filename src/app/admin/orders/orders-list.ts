/* ============================================================
   주문 목록 화면 공용 값 — 탭 정의와 한국식 날짜 다루기

   왜 날짜를 직접 다루는가:
   기간 필터가 브라우저 기본 <input type="date"> 였다. 관리자 브라우저 로케일이 en-US 라
   화면에 'mm/dd/yyyy' 로 떴고, 한국 대표가 8월 19일을 넣으려고 앞칸에 19 를 치면 월 자리로
   들어가 오류가 났다. 'mm/dd/yyyy' 라는 기호 자체가 한국인 사용자에게는 읽히지 않는다.
   그래서 자주 쓰는 기간은 버튼으로, 직접 입력은 'yyyy.mm.dd' 한국식으로만 받는다.
   ============================================================ */

import { ORDER_STATUS_LABELS } from "@/lib/admin-labels";

export interface OrderTabDef {
  key: string;
  label: string;
  /** 그 탭이 비었을 때 다음 행동을 지목하기 위한 짧은 이름 */
  short: string;
}

/**
 * 서버 filters.ts 의 TAB_STATUSES 와 키가 같아야 한다.
 *
 * 탭 이름을 화면 안에서 짓지 않는 이유:
 * 같은 상태를 탭은 '준비중', 바로 아래 표의 상태 표시는 '상품 준비중' 이라고 불렀다.
 * 한 화면 안에서 같은 것을 두 이름으로 부르면 대표는 서로 다른 것으로 읽는다.
 * 그래서 띄어쓰기까지 규범(ORDER_STATUS_LABELS)에서 가져온다.
 * 여러 상태를 한 칸에 묶는 탭(전체 · 취소·환불)만 이름을 따로 둔다.
 */
const STATUS_TAB_KEYS = ["pending", "paid", "preparing", "shipped", "delivered"] as const;

export const ORDER_TABS: OrderTabDef[] = [
  { key: "all", label: "전체", short: "주문" },
  ...STATUS_TAB_KEYS.map((key) => ({
    key,
    label: ORDER_STATUS_LABELS[key],
    short: `${ORDER_STATUS_LABELS[key]} 주문`,
  })),
  { key: "cancelled", label: "취소·환불", short: "취소·환불 주문" },
];

export function isOrderTab(key: string): boolean {
  return ORDER_TABS.some((t) => t.key === key);
}

/* ---------- 한국식 날짜 ---------- */

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Date → "2026-08-19" (API 가 받는 형식, 사용자에게는 보이지 않는다) */
function toValue(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** "2026-08-19" → "2026.08.19" (화면 표기) */
export function toKoreanDate(value: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value.replace(/-/g, ".") : value;
}

/**
 * 사람이 친 글자를 날짜로 읽는다.
 * "2026.08.19" · "2026-8-19" · "2026/08/19" · "20260819" 를 모두 받아 준다.
 * 읽히지 않으면 null — 화면이 "예) 2026.08.19" 라고 다시 알려 준다.
 */
export function parseKoreanDate(input: string): string | null {
  const text = input.trim();
  if (!text) return "";
  const compact = /^(\d{4})(\d{2})(\d{2})$/.exec(text.replace(/\s/g, ""));
  const dotted = /^(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})\.?$/.exec(text);
  const m = compact ?? dotted;
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const date = new Date(y, mo - 1, d);
  // 2026.02.31 처럼 없는 날짜는 Date 가 다음 달로 넘겨 버린다 — 되짚어 확인한다
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) return null;
  return toValue(date);
}

export interface DateRangeValue {
  from: string;
  to: string;
}

export const DATE_PRESETS = [
  { key: "today", label: "오늘" },
  { key: "yesterday", label: "어제" },
  { key: "last7", label: "최근 7일" },
  { key: "thisMonth", label: "이번 달" },
  { key: "lastMonth", label: "지난 달" },
] as const;

export type DatePresetKey = (typeof DATE_PRESETS)[number]["key"];

export function presetRange(key: DatePresetKey): DateRangeValue {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const shift = (days: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() + days);
    return d;
  };

  switch (key) {
    case "today":
      return { from: toValue(today), to: toValue(today) };
    case "yesterday": {
      const y = shift(-1);
      return { from: toValue(y), to: toValue(y) };
    }
    case "last7":
      return { from: toValue(shift(-6)), to: toValue(today) };
    case "thisMonth":
      return {
        from: toValue(new Date(now.getFullYear(), now.getMonth(), 1)),
        to: toValue(today),
      };
    case "lastMonth": {
      const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const last = new Date(now.getFullYear(), now.getMonth(), 0);
      return { from: toValue(first), to: toValue(last) };
    }
  }
}

/** 지금 걸린 기간이 어떤 빠른 선택과 같은가 (강조 표시용) */
export function matchedPreset(range: DateRangeValue): DatePresetKey | null {
  if (!range.from && !range.to) return null;
  for (const p of DATE_PRESETS) {
    const r = presetRange(p.key);
    if (r.from === range.from && r.to === range.to) return p.key;
  }
  return null;
}

/** 툴바 칩에 쓰는 기간 표기 — "2026.08.01 – 08.19" */
export function describeRange(range: DateRangeValue): string {
  const from = range.from ? toKoreanDate(range.from) : "";
  const to = range.to ? toKoreanDate(range.to) : "";
  if (from && to) {
    const sameYear = from.slice(0, 4) === to.slice(0, 4);
    return `${from} – ${sameYear ? to.slice(5) : to}`;
  }
  if (from) return `${from}부터`;
  return `${to}까지`;
}
