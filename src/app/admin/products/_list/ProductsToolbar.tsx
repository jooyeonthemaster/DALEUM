"use client";

/* ============================================================
   목록 위 검색·필터 줄.

   공급처(자체/수다락)와 브랜드 필터가 여기 들어온 것이 핵심이다. 두 값 모두 DB 에는
   진작 있었는데 화면에 없어서, 관리자가 "수다락에서 받은 상품만 보기" 를 할 방법이
   전혀 없었다. 선택지는 하드코딩하지 않고 실제로 저장된 값만 서버에서 받아 그린다.
   ============================================================ */

import Link from "next/link";
import { RotateCcw } from "lucide-react";
import SearchInput from "@/components/admin/SearchInput";
import { Select } from "@/components/admin/Field";
import type { Category } from "@/lib/types";
import { BTN_GHOST, BTN_PRIMARY, PRODUCT_STATUS_OPTIONS } from "../product-ui";
import type { ListFacets } from "./list-types";

export interface ProductsToolbarProps {
  q: string;
  onQChange: (value: string) => void;
  onQSubmit: () => void;
  category: string;
  onCategoryChange: (value: string) => void;
  supplier: string;
  onSupplierChange: (value: string) => void;
  brand: string;
  onBrandChange: (value: string) => void;
  status: string;
  onStatusChange: (value: string) => void;
  categories: Category[];
  facets: ListFacets;
  hasFilter: boolean;
  onReset: () => void;
}

export default function ProductsToolbar({
  q,
  onQChange,
  onQSubmit,
  category,
  onCategoryChange,
  supplier,
  onSupplierChange,
  brand,
  onBrandChange,
  status,
  onStatusChange,
  categories,
  facets,
  hasFilter,
  onReset,
}: ProductsToolbarProps) {
  return (
    <div className="mb-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <SearchInput
          value={q}
          onChange={onQChange}
          onSubmit={onQSubmit}
          // 품번이 비어 있는 상품이 절반이라 이름·품번만으로는 찾히지 않았다
          placeholder="상품명 · 품번 · 브랜드 · 공급처 검색"
          className="xl:max-w-72"
        />
        <div className="flex flex-wrap items-center gap-2">
          <Select
            aria-label="카테고리 필터"
            value={category}
            onChange={(e) => onCategoryChange(e.target.value)}
            className="w-36"
          >
            <option value="">전체 카테고리</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          <Select
            aria-label="공급처 필터"
            value={supplier}
            onChange={(e) => onSupplierChange(e.target.value)}
            className="w-32"
          >
            <option value="">전체 공급처</option>
            {facets.suppliers.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
          <Select
            aria-label="브랜드 필터"
            value={brand}
            onChange={(e) => onBrandChange(e.target.value)}
            className="w-32"
          >
            <option value="">전체 브랜드</option>
            {facets.brands.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </Select>
          <Select
            aria-label="상태 필터"
            value={status}
            onChange={(e) => onStatusChange(e.target.value)}
            className="w-28"
          >
            <option value="">전체 상태</option>
            {PRODUCT_STATUS_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
          {hasFilter && (
            <button
              type="button"
              onClick={onReset}
              className={`${BTN_GHOST} inline-flex items-center gap-1.5 whitespace-nowrap py-2 text-[13px]`}
            >
              <RotateCcw size={14} strokeWidth={1.5} />
              조건 지우기
            </button>
          )}
          <Link href="/admin/products/bulk" className={`${BTN_GHOST} whitespace-nowrap`}>
            일괄 등록
          </Link>
          <Link href="/admin/products/new" className={`${BTN_PRIMARY} whitespace-nowrap`}>
            새 상품
          </Link>
        </div>
      </div>

      {/* 선택지가 잘렸다면 반드시 말해 준다 — 목록에 없는 공급처를 관리자가
          "그런 값은 없다" 고 읽어 버리면 그 상품들을 영영 찾지 못한다 */}
      {facets.truncated && (
        <p className="mt-2 text-xs leading-relaxed text-signal-amber">
          상품이 많아 공급처·브랜드 선택지 일부가 빠졌을 수 있습니다. 찾는 값이 목록에 없으면
          검색창에 직접 적어 주세요.
        </p>
      )}
    </div>
  );
}
