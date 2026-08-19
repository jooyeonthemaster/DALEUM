"use client";

/* ============================================================
   목록 한 칸씩을 그리는 조각들.

   데스크톱 표와 모바일 카드가 같은 내용을 두 번 그려야 해서 조각을 나눠 두었다.
   두 곳이 따로 자라면 "휴대폰에서는 원가가 안 보인다" 같은 어긋남이 생긴다.
   ============================================================ */

import Image from "next/image";
import Link from "next/link";
import { ImageOff, Star } from "lucide-react";
import { Select } from "@/components/admin/Field";
import { krw } from "@/lib/format";
import type { ProductStatus } from "@/lib/types";
import { PRODUCT_STATUS_OPTIONS, PRODUCT_STATUS_TONES } from "../product-ui";
import { HEALTH_HINTS, HEALTH_LABELS, HEALTH_SEVERE } from "./product-health";
import type { ProductListRow } from "./list-types";

/** 옵션이 있으면 옵션 재고 합계, 없으면 상품 재고 */
export function stockOf(p: ProductListRow): { stock: number; hasVariants: boolean } {
  const variants = p.product_variants ?? [];
  if (variants.length > 0) {
    return { stock: variants.reduce((sum, v) => sum + v.stock, 0), hasVariants: true };
  }
  return { stock: p.stock, hasVariants: false };
}

/** 문제 배지 — 붉은색은 그대로 두면 못 파는 것, 노란색은 고객 화면이 어긋나는 것 */
export function HealthBadges({ codes }: { codes: ProductListRow["health"] }) {
  if (codes.length === 0) return null;
  return (
    <span className="mt-1 flex flex-wrap gap-1">
      {codes.map((code) => {
        const severe = HEALTH_SEVERE.includes(code);
        return (
          <span
            key={code}
            title={HEALTH_HINTS[code]}
            className={`border px-1.5 py-0.5 text-[11px] leading-none ${
              severe
                ? "border-signal-red/40 bg-signal-red/5 text-signal-red"
                : "border-signal-amber/40 bg-signal-amber/5 text-signal-amber"
            }`}
          >
            {HEALTH_LABELS[code]}
          </span>
        );
      })}
    </span>
  );
}

/** 사진 + 상품명 + 공급처·브랜드·품번 + 문제 배지 */
export function ProductCell({ row }: { row: ProductListRow }) {
  return (
    <div className="flex items-start gap-3">
      <Link
        href={`/admin/products/${row.id}`}
        tabIndex={-1}
        aria-hidden
        className="relative block h-11 w-11 shrink-0 overflow-hidden border border-ink-200 bg-cream-100"
      >
        {row.thumbnail ? (
          <Image src={row.thumbnail} alt="" fill sizes="44px" className="object-cover" />
        ) : (
          // 예전에는 이 자리에 영문 'No img' 가 그대로 보였다 — 관리자가 오류 코드로 오해했다
          <span
            title="사진이 없습니다"
            className="flex h-full w-full items-center justify-center text-signal-amber"
          >
            <ImageOff size={14} strokeWidth={1.5} />
          </span>
        )}
      </Link>
      <div className="min-w-0">
        <Link
          href={`/admin/products/${row.id}`}
          className="block truncate font-medium text-ink-900 underline-offset-2 hover:underline"
        >
          {row.name}
          {row.is_featured && (
            <Star
              size={13}
              strokeWidth={1.5}
              aria-label="추천 상품"
              className="ml-1 inline text-brass-500"
            />
          )}
        </Link>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-ink-400">
          {row.supplier && (
            <span className="border border-ink-200 bg-cream-100 px-1.5 py-0.5 leading-none text-ink-600">
              {row.supplier}
            </span>
          )}
          {row.brand && <span className="text-ink-500">{row.brand}</span>}
          <span className="truncate">{row.sku ?? "품번 미지정"}</span>
        </span>
        <HealthBadges codes={row.health} />
      </div>
    </div>
  );
}

/**
 * 판매가 · 정가(할인율) · 원가와 마진율.
 *
 * 원가를 입력해도 어디에도 계산되지 않아 "이 상품 얼마 남느냐"를 계산기로 두드려야 했다.
 * 목록에서 바로 읽히게 두면 마진이 얇은 상품이 눈에 띈다.
 */
export function PriceCell({ row }: { row: ProductListRow }) {
  const discount =
    row.compare_at_price != null && row.compare_at_price > row.price
      ? Math.round(((row.compare_at_price - row.price) / row.compare_at_price) * 100)
      : null;
  const margin =
    row.cost_price != null && row.price > 0
      ? Math.round(((row.price - row.cost_price) / row.price) * 1000) / 10
      : null;

  return (
    <div className="krw leading-tight">
      {row.price > 0 ? (
        <span className="font-medium text-ink-900">{krw(row.price)}원</span>
      ) : (
        // 0원을 정상 가격처럼 보여 주면 팔 수 있는 상품으로 오인한다
        <span className="font-medium text-signal-red">가격 미입력</span>
      )}
      {discount != null && (
        <span className="ml-1.5 text-xs text-ink-400">
          <span className="line-through">{krw(row.compare_at_price ?? 0)}</span>
          <span className="ml-1 text-signal-red">-{discount}%</span>
        </span>
      )}
      <span className="mt-0.5 block text-[11px] text-ink-400">
        {row.cost_price == null ? (
          "원가 미입력"
        ) : (
          <>
            원가 {krw(row.cost_price)}원
            {margin != null && (
              <span className={margin < 15 ? " text-signal-red" : " text-ink-500"}>
                {" · "}마진 {margin}%
              </span>
            )}
          </>
        )}
      </span>
    </div>
  );
}

export function StockCell({ row }: { row: ProductListRow }) {
  const { stock, hasVariants } = stockOf(row);
  const low = stock <= row.low_stock_threshold;
  return (
    <span className="whitespace-nowrap">
      <span className={`krw font-medium ${low ? "text-signal-amber" : "text-ink-900"}`}>
        {krw(stock)}
      </span>
      {hasVariants && <span className="ml-1 text-xs text-ink-400">옵션 합계</span>}
    </span>
  );
}

export interface StatusCellProps {
  row: ProductListRow;
  busy: boolean;
  error?: string;
  onStatusChange: (row: ProductListRow, next: ProductStatus) => void;
}

/**
 * 상태 드롭다운.
 *
 * 저장 중에는 잠그고, 실패하면 그 행 바로 아래에 이유를 남긴다 — 예전에는 화면 맨 위
 * 배너 하나가 전부라 20번째 행에서 실패하면 아무 신호도 못 봤고, 값만 슬쩍 되돌아갔다.
 */
export function StatusCell({ row, busy, error, onStatusChange }: StatusCellProps) {
  const noPrice = row.price <= 0;
  /**
   * 재고가 남았는데 품절인 상품이 실제로 4건 있다.
   *
   * 이 저장소에는 재고와 상태를 잇는 코드가 없다 — 재고가 0이 되어도 자동으로 품절이
   * 되지 않고, 반대로 재고를 채워도 품절이 저절로 풀리지 않는다. 그래서 목록에서
   * "재고 100 · 품절" 을 나란히 본 사람은 어느 쪽이 진실인지 알 수 없었고,
   * 재고만 보고 "팔 수 있다" 고 판단했다. 사람이 일부러 내려 둔 것임을 적어 준다.
   */
  const { stock } = stockOf(row);
  const manualSoldOut = row.status === "sold_out" && stock > 0;
  return (
    <div>
      <Select
        aria-label={`${row.name} 판매 상태 변경`}
        value={row.status}
        disabled={busy}
        onChange={(e) => onStatusChange(row, e.target.value as ProductStatus)}
        className={`w-32 text-left [&_select]:py-1.5 [&_select]:text-xs ${PRODUCT_STATUS_TONES[row.status]}`}
      >
        {PRODUCT_STATUS_OPTIONS.map(([value, label]) => (
          // 판매가가 0원이면 서버가 판매중 전환을 거절한다 — 고르기 전에 막고 이유를 적는다
          <option key={value} value={value} disabled={value === "active" && noPrice}>
            {value === "active" && noPrice ? `${label} — 판매가 먼저 입력` : label}
          </option>
        ))}
      </Select>
      {manualSoldOut && !busy && (
        <p className="krw mt-1 text-[11px] leading-snug text-signal-amber">
          재고 {krw(stock)}개가 남아 있는데 사람이 내려 둔 품절입니다
        </p>
      )}
      {busy && <p className="mt-1 text-[11px] text-ink-400">저장 중…</p>}
      {error && <p className="mt-1 text-[11px] leading-snug text-signal-red">{error}</p>}
    </div>
  );
}
