"use client";

/* ============================================================
   "지금 고객 화면에 보이는가" 를 한눈에.

   홈 대문 배너도 팝업도 **여러 개를 켜도 한 개만 나온다**.
   src/app/(shop)/page.tsx 가 조건에 맞는 첫 건만 골라 넘기기 때문이다
   (배너 64-67행, 팝업 86-87행). 그런데 관리자 목록에는 켜짐/꺼짐 스위치뿐이라,
   팝업 3개를 순서 1·2·3 으로 켜 두면 3개가 차례로 뜬다고 믿게 된다.
   그래서 목록에서 실제로 나가는 한 건만 "지금 노출 중" 으로 표시하고
   나머지는 왜 안 나오는지를 말해 준다.
   ============================================================ */

export type ExposureState = "live" | "queued" | "scheduled" | "ended" | "hidden" | "noimage";

export const EXPOSURE_LABELS: Record<ExposureState, string> = {
  live: "지금 노출 중",
  queued: "대기",
  scheduled: "시작 전",
  ended: "기간 종료",
  hidden: "숨김",
  noimage: "사진 없음",
};

export const EXPOSURE_HINTS: Record<ExposureState, string> = {
  live: "고객 화면에 지금 이것이 나가고 있습니다.",
  queued: "앞 순서가 내려가면 이것이 나갑니다.",
  scheduled: "시작일이 아직 오지 않았습니다.",
  ended: "종료일이 지나 더 이상 나오지 않습니다.",
  hidden: "꺼져 있어 고객에게 보이지 않습니다.",
  noimage: "사진이 없어 고객 화면에 나갈 수 없습니다.",
};

const TONE: Record<ExposureState, string> = {
  live: "bg-forest-100 text-forest-800",
  queued: "bg-cream-100 text-ink-600",
  scheduled: "bg-cream-100 text-ink-600",
  ended: "bg-cream-100 text-ink-400",
  hidden: "bg-cream-100 text-ink-400",
  noimage: "bg-cream-100 text-signal-red",
};

/** 기간 유효성 — src/app/(shop)/page.tsx 의 isWithinPeriod 와 같은 판정이어야 한다 */
export function isWithinPeriod(startsAt: string | null, endsAt: string | null, now: Date): boolean {
  if (startsAt && new Date(startsAt) > now) return false;
  if (endsAt && new Date(endsAt) < now) return false;
  return true;
}

export interface ExposureInput {
  is_active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  /** 사진이 있어야만 나가는 자리(홈 대문)면 넘긴다 */
  needsImage?: boolean;
  hasImage?: boolean;
}

/**
 * 한 행의 상태. `takenByEarlier` 는 "앞 순서에 이미 나갈 것이 있다" 는 뜻이고,
 * 목록을 훑으며 호출부가 계산해 넘긴다(스토어프론트와 같은 순서로 훑어야 한다).
 */
export function exposureState(row: ExposureInput, takenByEarlier: boolean, now: Date): ExposureState {
  if (!row.is_active) return "hidden";
  if (row.needsImage && !row.hasImage) return "noimage";
  if (row.starts_at && new Date(row.starts_at) > now) return "scheduled";
  if (row.ends_at && new Date(row.ends_at) < now) return "ended";
  return takenByEarlier ? "queued" : "live";
}

export default function ExposureBadge({ state }: { state: ExposureState }) {
  return (
    <span
      title={EXPOSURE_HINTS[state]}
      className={`inline-block px-2 py-0.5 text-[11px] leading-tight ${TONE[state]}`}
    >
      {EXPOSURE_LABELS[state]}
    </span>
  );
}
