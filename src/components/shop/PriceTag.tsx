import { discountRate, krw } from "@/lib/format";

export interface PriceTagProps {
  /** 실제 판매가 */
  price: number;
  /** 비교가(정가) — price보다 클 때만 취소선 + 할인율 표시 */
  compareAt?: number | null;
  /** VIP 가격 적용 여부 — 브라스 "VIP" 라벨 표시 */
  vipApplied?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const SIZE_STYLES = {
  sm: { main: "text-[15px]", sub: "text-xs", gap: "gap-x-1.5" },
  md: { main: "text-lg", sub: "text-[13px]", gap: "gap-x-2" },
  lg: { main: "text-2xl md:text-[1.7rem]", sub: "text-sm", gap: "gap-x-2.5" },
} as const;

/** 가격 표시 단독 컴포넌트 — 서버/클라이언트 겸용 */
export default function PriceTag({
  price,
  compareAt,
  vipApplied = false,
  size = "md",
  className = "",
}: PriceTagProps) {
  const s = SIZE_STYLES[size];
  const showCompare = compareAt != null && compareAt > price;
  const rate = showCompare ? discountRate(compareAt, price) : 0;

  return (
    <p className={`krw flex flex-wrap items-baseline gap-y-0.5 ${s.gap} ${className}`}>
      {vipApplied && (
        <span className={`label-caps text-brass-500 ${size === "lg" ? "" : "text-[10px]"}`}>
          VIP
        </span>
      )}
      {showCompare && rate > 0 && (
        <span className={`font-semibold text-forest-600 ${s.main}`}>{rate}%</span>
      )}
      <span className={`font-semibold text-ink-900 ${s.main}`}>{krw(price)}원</span>
      {showCompare && (
        <del className={`font-normal text-ink-400 ${s.sub}`}>{krw(compareAt)}원</del>
      )}
    </p>
  );
}
