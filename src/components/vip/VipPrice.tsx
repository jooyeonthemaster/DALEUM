import { discountRate, krw } from "@/lib/format";

export interface VipPriceProps {
  /** 실제 판매가 (VIP/캠페인 반영가) */
  price: number;
  /** 정가 — price보다 클 때만 취소선 + 할인율 표시 */
  compareAt?: number | null;
  /** 우대가 적용 여부 — 마크와 브라스 톤 표시 */
  vipApplied?: boolean;
  /** label-caps 마크 문구 (기본 "VIP", 캠페인은 "Invitation" 등) */
  markLabel?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const SIZE_STYLES = {
  sm: { main: "text-[15px]", sub: "text-xs", gap: "gap-x-1.5" },
  md: { main: "text-lg", sub: "text-[13px]", gap: "gap-x-2" },
  lg: { main: "text-2xl md:text-[1.7rem]", sub: "text-sm", gap: "gap-x-2.5" },
} as const;

/**
 * VIP 다크 화면(forest-950) 전용 가격 표시 — 서버/클라이언트 겸용.
 * 우대가는 brass, 정가 취소선은 은은한 cream 톤.
 * 밝은 배경에서는 공용 PriceTag(@/components/shop/PriceTag)를 쓸 것.
 */
export default function VipPrice({
  price,
  compareAt,
  vipApplied = false,
  markLabel = "VIP",
  size = "md",
  className = "",
}: VipPriceProps) {
  const s = SIZE_STYLES[size];
  const showCompare = compareAt != null && compareAt > price;
  const rate = showCompare ? discountRate(compareAt, price) : 0;

  return (
    <p className={`krw flex flex-wrap items-baseline gap-y-0.5 ${s.gap} ${className}`}>
      {vipApplied && (
        <span className={`label-caps text-brass-300 ${size === "lg" ? "" : "text-[10px]"}`}>
          {markLabel}
        </span>
      )}
      {showCompare && rate > 0 && (
        <span className={`font-semibold text-brass-300 ${s.main}`}>{rate}%</span>
      )}
      <span
        className={`font-semibold ${vipApplied ? "text-brass-300" : "text-cream-50"} ${s.main}`}
      >
        {krw(price)}원
      </span>
      {showCompare && (
        <del className={`font-normal text-cream-50/35 ${s.sub}`}>{krw(compareAt)}원</del>
      )}
    </p>
  );
}
