/* ============================================================
   가격 일괄 조정 계산.

   이 파일이 화면 폴더에 있는데 서버 라우트도 가져다 쓰는 이유:
   관리자가 모달에서 미리 본 "바뀔 가격"과 서버가 실제로 저장한 값이 1원이라도
   다르면 이 기능은 쓸 수 없는 기능이 된다(퍼센트·반올림은 구현이 조금만 어긋나도
   끝자리가 갈린다). 그래서 계산식을 한 곳에만 두고
   /api/admin/products/bulk-edit 라우트가 같은 함수를 호출한다.
   React 의존이 없어 서버에서 그대로 동작한다.
   ============================================================ */

/** 조정 대상 필드 — 화면에는 라벨만 보인다 */
export type PriceTarget = "price" | "compare_at_price" | "cost_price";

export const PRICE_TARGET_LABELS: Record<PriceTarget, string> = {
  price: "판매가",
  compare_at_price: "정가",
  cost_price: "원가",
};

export const PRICE_TARGETS = Object.keys(PRICE_TARGET_LABELS) as PriceTarget[];

/** 조정 방식 */
export type PriceMode = "percent" | "amount" | "set";

export const PRICE_MODE_LABELS: Record<PriceMode, string> = {
  percent: "퍼센트로 올리거나 내리기",
  amount: "금액으로 올리거나 내리기",
  set: "모두 같은 값으로 정하기",
};

export const PRICE_MODES = Object.keys(PRICE_MODE_LABELS) as PriceMode[];

/** 끝자리 처리 단위 */
export const ROUND_UNITS = [1, 10, 100, 1000] as const;
export type RoundUnit = (typeof ROUND_UNITS)[number];

export const ROUND_UNIT_LABELS: Record<RoundUnit, string> = {
  1: "1원 단위 (그대로)",
  10: "10원 단위",
  100: "100원 단위",
  1000: "1,000원 단위",
};

/** 끝자리를 어느 쪽으로 보낼지 */
export type RoundDir = "round" | "up" | "down";

export const ROUND_DIR_LABELS: Record<RoundDir, string> = {
  round: "가까운 쪽으로",
  up: "올림",
  down: "내림",
};

export interface PriceAdjustPlan {
  target: PriceTarget;
  mode: PriceMode;
  /** percent 면 % , amount 면 증감액(음수 가능), set 이면 지정할 금액 */
  value: number;
  unit: RoundUnit;
  dir: RoundDir;
}

/** shared.ts 의 금액 상한과 같은 값 — 넘으면 서버가 어차피 거절한다 */
export const PRICE_MAX = 100_000_000;

/**
 * 퍼센트 허용 범위.
 *
 * 상수로 빼 둔 이유: 화면이 "왜 적용할 수 없는지" 를 한국어로 적으려면 같은 숫자를
 * 알아야 하는데, 그 숫자를 화면에 다시 적어 두면 언젠가 두 값이 갈라진다.
 * (실제로 화면은 아예 검사하지 않아, 800% 를 넣어도 미리보기를 다 보여 준 다음
 *  서버가 "요청한 변경 내용을 이해하지 못했습니다" 로 거절하고 입력이 통째로 날아갔다.)
 */
export const PERCENT_MIN = -100;
export const PERCENT_MAX = 1000;

function isRoundUnit(v: unknown): v is RoundUnit {
  return ROUND_UNITS.includes(v as RoundUnit);
}

/** 화면·서버가 같은 형태의 요청을 주고받는지 확인한다 (서버는 이걸 통과한 값만 쓴다) */
export function parsePlan(raw: unknown): PriceAdjustPlan | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  if (!PRICE_TARGETS.includes(p.target as PriceTarget)) return null;
  if (!PRICE_MODES.includes(p.mode as PriceMode)) return null;
  if (typeof p.value !== "number" || !Number.isFinite(p.value)) return null;
  if (!isRoundUnit(p.unit)) return null;
  if (!["round", "up", "down"].includes(p.dir as string)) return null;
  // 퍼센트는 -100%(전액 할인) ~ +1000% 로 제한한다. 손이 미끄러져 8 대신 800 을 넣는 사고를
  // 완전히 막을 수는 없지만, 자릿수가 터무니없이 큰 값은 여기서 끊는다.
  if (p.mode === "percent" && (p.value < PERCENT_MIN || p.value > PERCENT_MAX)) return null;
  if (p.mode !== "percent" && Math.abs(p.value) > PRICE_MAX) return null;
  if (p.mode === "set" && p.value < 0) return null;
  return {
    target: p.target as PriceTarget,
    mode: p.mode as PriceMode,
    value: p.value,
    unit: p.unit,
    dir: p.dir as RoundDir,
  };
}

/** 끝자리 처리 — 단위가 1이면 소수만 정리한다 */
export function applyRounding(raw: number, unit: RoundUnit, dir: RoundDir): number {
  const q = raw / unit;
  const n = dir === "up" ? Math.ceil(q) : dir === "down" ? Math.floor(q) : Math.round(q);
  return n * unit;
}

/**
 * 한 상품의 새 가격을 구한다.
 *
 * @returns 바꿀 값. `null` 이면 "바꿀 수 없음" — 예를 들어 정가가 비어 있는 상품에
 *          퍼센트 증감을 걸면 기준값이 없으므로 건드리지 않고 건너뛴다.
 *          (0 을 곱해 0원으로 만들어 버리면 조용히 가격을 지우는 사고가 된다.)
 */
export function adjustPrice(current: number | null, plan: PriceAdjustPlan): number | null {
  if (plan.mode === "set") {
    const next = applyRounding(plan.value, plan.unit, plan.dir);
    return clamp(next);
  }
  if (current === null || current === undefined) return null;
  const raw = plan.mode === "percent" ? current * (1 + plan.value / 100) : current + plan.value;
  return clamp(applyRounding(raw, plan.unit, plan.dir));
}

function clamp(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(PRICE_MAX, Math.max(0, Math.round(n)));
}

/**
 * 한 줄 요약 — 화면에 그대로 보이므로 전부 한국어다.
 *
 * @param done 이미 적용한 뒤의 안내면 true. 같은 문장을 적용 전(모달)과 적용 후(결과 알림)에
 *             모두 쓰는데, 끝난 일을 "올립니다"라고 적으면 아직 안 바뀐 것처럼 읽힌다.
 */
export function describePlan(plan: PriceAdjustPlan, { done = false } = {}): string {
  const target = PRICE_TARGET_LABELS[plan.target];
  const rounding =
    plan.unit === 1
      ? ""
      : ` · 끝자리는 ${ROUND_UNIT_LABELS[plan.unit]}로 ${ROUND_DIR_LABELS[plan.dir]}`;

  if (plan.mode === "set") {
    const verb = done ? "맞췄습니다" : "맞춥니다";
    return `${target}를 모두 ${plan.value.toLocaleString("ko-KR")}원으로 ${verb}${rounding}`;
  }
  const up = plan.value >= 0;
  const verb = done ? (up ? "올렸습니다" : "내렸습니다") : up ? "올립니다" : "내립니다";
  const amount =
    plan.mode === "percent"
      ? `${Math.abs(plan.value)}%`
      : `${Math.abs(plan.value).toLocaleString("ko-KR")}원`;
  return `${target}를 ${amount} ${verb}${rounding}`;
}
