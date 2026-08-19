"use client";

/* ============================================================
   재고 화면 공용 표시 조각 — 라벨·배지·수량 표기

   화면에 상태 코드(draft/active/sold_out/hidden)나 영문 필드명이 새어 나가지 않게
   여기 한 곳에서만 사람 말로 바꾼다. 다른 파일에서는 이 조각들만 쓴다.
   ============================================================ */

import Image from "next/image";
import { ImageOff } from "lucide-react";
import { krw } from "@/lib/format";
import { PRODUCT_STATUS_LABELS } from "@/app/admin/products/product-ui";
import type { ProductStatus } from "@/lib/types";
import type { InventoryUnit } from "./inventory-types";

/**
 * 옵션 상품에서 "상품 그 자체의 재고" 행을 부르는 이름.
 * 엑셀 양식의 옵션 칸에도 이 말을 그대로 적고 서버가 그 말로 짝을 맞춘다 —
 * 서버쪽 같은 이름의 상수(api/admin/inventory/shared.ts)와 글자가 어긋나면 일괄 입고가 실패한다.
 */
export const PRODUCT_SCOPE_LABEL = "상품 자체 재고";

export function statusLabel(status: string): string {
  return PRODUCT_STATUS_LABELS[status as ProductStatus] ?? "상태 미확인";
}

/** 모달·토스트·엑셀에서 한 줄로 쓰는 품목 이름 */
export function unitLabel(u: InventoryUnit): string {
  if (u.scope === "variant") return `${u.name} — ${u.option_name ?? ""}`;
  return u.has_options ? `${u.name} — ${PRODUCT_SCOPE_LABEL}` : u.name;
}

/**
 * 고객 화면이 이 품목을 어떻게 다루는지 한 문장으로.
 * 판정 근거는 고객 상세페이지·상품 카드 코드 그대로다 —
 * 두 곳 모두 옵션 유무와 상관없이 '상품 자체 재고'만 보고 품절을 정한다.
 */
export function storefrontHint(u: InventoryUnit): string {
  if (u.status === "draft") return "아직 공개하지 않은 상품이라 고객 화면에 나오지 않습니다.";
  if (u.status === "hidden") return "숨긴 상품이라 고객 화면에 나오지 않습니다.";
  if (u.storefront_locked) {
    return `옵션 재고가 ${krw(u.option_stock_total)}개 남아 있는데도 고객 화면에서는 상품 전체가 품절로 보입니다. 고객 화면이 옵션 합계가 아니라 '${PRODUCT_SCOPE_LABEL}'만 보기 때문입니다.`;
  }
  if (u.options_all_off) {
    return `옵션을 전부 판매 중지해서 고객은 옵션을 고르지 않고 '${PRODUCT_SCOPE_LABEL}' ${krw(u.product_stock)}개로 구매합니다.`;
  }
  if (u.status === "sold_out") {
    return u.sellable_stock > 0
      ? `재고가 ${krw(u.sellable_stock)}개 있는데 판매 상태가 품절이라 고객은 살 수 없습니다.`
      : "판매 상태가 품절이라 고객 화면에 품절로 표시됩니다.";
  }
  if (u.scope === "variant" && !u.is_active) {
    return "판매를 중지한 옵션이라 고객 화면의 옵션 목록에 나오지 않습니다.";
  }
  if (u.scope === "variant" && u.stock <= 0) {
    return "이 옵션만 품절입니다. 다른 옵션은 그대로 팔립니다.";
  }
  if (u.sellable_stock <= 0) return "재고가 없어 고객 화면에 품절로 표시됩니다.";
  return `고객이 지금 살 수 있습니다. 판매 가능 수량 ${krw(u.sellable_stock)}개.`;
}

/** 판매 상태와 재고가 어긋난 것을 사람 말로 */
export function mismatchText(u: InventoryUnit): string | null {
  if (u.status_mismatch === "empty_but_selling") return "판매중인데 재고 없음";
  if (u.status_mismatch === "stocked_but_sold_out") return "재고 있는데 품절 상태";
  return null;
}

const CHIP = "inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs";

export function SaleStatusBadge({ unit }: { unit: InventoryUnit }) {
  const tone =
    unit.status === "active"
      ? "bg-forest-50 text-forest-700"
      : unit.status === "sold_out"
        ? "bg-cream-100 text-signal-amber"
        : "bg-cream-100 text-ink-500";
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <span className={`${CHIP} ${tone}`}>{statusLabel(unit.status)}</span>
      {unit.scope === "variant" && !unit.is_active && (
        <span className="text-[11px] text-ink-400">판매 중지한 옵션</span>
      )}
    </span>
  );
}

/** 고객 화면에서 이 품목이 팔리는지 — 잠김은 반드시 붉게 */
export function StorefrontBadge({ unit }: { unit: InventoryUnit }) {
  if (unit.storefront_locked) {
    return (
      <span className={`${CHIP} bg-[#f7e4de] font-medium text-signal-red`}>품절로 잠김</span>
    );
  }
  if (unit.status === "draft" || unit.status === "hidden") {
    return <span className="text-xs text-ink-400">노출 안 함</span>;
  }
  if (unit.scope === "variant" && !unit.is_active) {
    return <span className="text-xs text-ink-400">노출 안 함</span>;
  }
  if (unit.options_all_off && unit.scope === "product") {
    return <span className={`${CHIP} bg-cream-100 text-signal-amber`}>옵션 없이 판매</span>;
  }
  const sellable = unit.scope === "variant" ? unit.stock : unit.sellable_stock;
  if (unit.status === "sold_out" || sellable <= 0) {
    return <span className="text-xs text-ink-500">품절 표시</span>;
  }
  return <span className={`${CHIP} bg-forest-50 text-forest-700`}>판매중</span>;
}

/** 현재고 — 품절/임박을 색으로 강조한다 */
export function StockValue({ unit }: { unit: InventoryUnit }) {
  if (unit.stock <= 0) {
    return <span className="krw font-semibold text-signal-red">0개 · 품절</span>;
  }
  const low = unit.threshold !== null && unit.stock <= unit.threshold;
  return (
    <span className={`krw font-medium ${low ? "text-signal-amber" : "text-ink-900"}`}>
      {krw(unit.stock)}
      {low && <span className="ml-1 text-xs">임박</span>}
    </span>
  );
}

export function DeltaText({ delta }: { delta: number }) {
  return (
    <span className={`krw font-medium ${delta > 0 ? "text-forest-700" : "text-signal-red"}`}>
      {delta > 0 ? `+${krw(delta)}` : krw(delta)}
    </span>
  );
}

/** 목록·검색 결과의 썸네일 — 사진이 없을 때 영문 문구가 나오지 않게 아이콘으로 대체 */
export function UnitThumb({ unit, size = 40 }: { unit: InventoryUnit; size?: number }) {
  return (
    <div
      className="relative shrink-0 overflow-hidden border border-ink-200 bg-cream-100"
      style={{ width: size, height: size }}
    >
      {unit.thumbnail ? (
        <Image
          src={unit.thumbnail}
          alt={unit.name}
          fill
          sizes={`${size}px`}
          className="object-cover"
        />
      ) : (
        <span
          className="flex h-full w-full items-center justify-center text-ink-300"
          title="등록된 사진 없음"
        >
          <ImageOff size={16} strokeWidth={1.5} aria-label="사진 없음" />
        </span>
      )}
    </div>
  );
}
