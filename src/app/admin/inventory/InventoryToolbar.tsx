"use client";

import { Download, PackagePlus, Sheet } from "lucide-react";
import SearchInput from "@/components/admin/SearchInput";
import { Select } from "@/components/admin/Field";
import { BTN_GHOST, BTN_PRIMARY } from "@/app/admin/products/product-ui";

export interface InventoryToolbarProps {
  q: string;
  onQChange: (v: string) => void;
  onQSubmit: () => void;
  filter: string;
  onFilterChange: (v: string) => void;
  sale: string;
  onSaleChange: (v: string) => void;
  onDownload: () => void;
  downloading: boolean;
  onBulk: () => void;
  onAdjust: () => void;
}

/** 재고 목록 위 도구 줄 — 검색 · 두 축의 필터 · 엑셀 · 입고 */
export default function InventoryToolbar({
  q,
  onQChange,
  onQSubmit,
  filter,
  onFilterChange,
  sale,
  onSaleChange,
  onDownload,
  downloading,
  onBulk,
  onAdjust,
}: InventoryToolbarProps) {
  return (
    <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <SearchInput
        value={q}
        onChange={onQChange}
        onSubmit={onQSubmit}
        placeholder="상품명 · 옵션 · 품번 검색"
        className="lg:max-w-72"
      />
      <div className="flex flex-wrap items-center gap-2">
        <Select
          aria-label="재고 상태로 걸러 보기"
          value={filter}
          onChange={(e) => onFilterChange(e.target.value)}
          className="w-40"
        >
          <option value="all">재고 전체</option>
          <option value="low">품절 임박</option>
          <option value="out">품절</option>
          <option value="locked">품절로 잠김</option>
          <option value="mismatch">상태 어긋남</option>
        </Select>
        {/* 초안·숨김 상품과 판매 중지한 옵션이 섞여 보이던 문제 — 축을 따로 둔다 */}
        <Select
          aria-label="판매 범위로 걸러 보기"
          value={sale}
          onChange={(e) => onSaleChange(e.target.value)}
          className="w-40"
        >
          <option value="all">전체 보기</option>
          <option value="selling">판매중인 것만</option>
        </Select>
        <button type="button" onClick={onDownload} disabled={downloading} className={BTN_GHOST}>
          <span className="inline-flex items-center gap-1.5">
            <Download size={15} strokeWidth={1.5} />
            {downloading ? "만드는 중…" : "엑셀 내려받기"}
          </span>
        </button>
        <button type="button" onClick={onBulk} className={BTN_GHOST}>
          <span className="inline-flex items-center gap-1.5">
            <Sheet size={15} strokeWidth={1.5} />
            엑셀 일괄 입고
          </span>
        </button>
        <button type="button" onClick={onAdjust} className={`${BTN_PRIMARY} whitespace-nowrap`}>
          <span className="inline-flex items-center gap-1.5">
            <PackagePlus size={15} strokeWidth={1.5} />
            입고 · 조정
          </span>
        </button>
      </div>
    </div>
  );
}
