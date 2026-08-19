"use client";

/* ============================================================
   상품 카드의 기본 정보 칸 — 이름 · 주소 · 가격 · 재고 · 보관

   DraftCard 에서 떼어 냈다(한 파일 500줄 상한). 여기 모인 칸들은
   "고객이 보는 값" 과 "관리용 값" 이 섞여 있어, 라벨과 도움말이 특히 중요하다.
   원가는 고객에게 보이지 않는다는 것을 도움말로 분명히 밝힌다 —
   원가를 판매가로 착각해 넣으면 그대로 손해가 난다.
   ============================================================ */

import { Wand2 } from "lucide-react";
import { Help, Input, Select } from "@/components/admin/Field";
import type { Category, StorageType } from "@/lib/types";
import { proposeSlug } from "./bulk-slug";
import { STORAGE_OPTIONS, marginText, type DraftIssue, type ProductDraft } from "./bulk-types";

export interface DraftBasicFieldsProps {
  draft: ProductDraft;
  categories: Category[];
  locked: boolean;
  issueOf: (field: DraftIssue["field"]) => string | undefined;
  onPatch: (patch: Partial<ProductDraft>) => void;
}

export default function DraftBasicFields({
  draft,
  categories,
  locked,
  issueOf,
  onPatch,
}: DraftBasicFieldsProps) {
  const margin = marginText(draft.price, draft.costPrice);

  return (
      <div className="grid gap-3 md:grid-cols-2">
        <label className="md:col-span-2">
          <span className="mb-1.5 block text-[13px] font-medium text-ink-700">상품명 *</span>
          <Input
            value={draft.name}
            disabled={locked}
            onChange={(e) => onPatch({ name: e.target.value })}
          />
          {issueOf("name") && <Help tone="error">{issueOf("name")}</Help>}
        </label>

        {/* 상품 주소 — 고객이 보는 주소다. 코드값을 날것으로 보여 주지 않는다 */}
        <div className="md:col-span-2">
          <span className="mb-1.5 block text-[13px] font-medium text-ink-700">상품 주소 *</span>
          <div className="flex gap-2">
            <Input
              value={draft.slug}
              disabled={locked}
              placeholder="yeoju-konjac-rice"
              onChange={(e) => onPatch({ slug: e.target.value, slugTouched: true })}
              className="flex-1"
            />
            <button
              type="button"
              disabled={locked || !draft.name.trim()}
              onClick={() => onPatch({ slug: proposeSlug(draft.name), slugTouched: true })}
              className="inline-flex shrink-0 items-center gap-1.5 border border-ink-200 px-3 text-xs text-ink-700 transition-colors hover:bg-cream-100 disabled:opacity-50"
            >
              <Wand2 size={14} strokeWidth={1.5} />
              상품명에서 만들기
            </button>
          </div>
          <p className="mt-1 truncate text-xs text-ink-400">
            고객이 보는 주소: /products/{draft.slug || "…"}
          </p>
          {issueOf("slug") ? (
            <Help tone="error">{issueOf("slug")}</Help>
          ) : (
            <Help>영문 소문자·숫자·붙임표(-)만 쓸 수 있습니다. 한글은 주소에 넣을 수 없습니다.</Help>
          )}
        </div>

        <label>
          <span className="mb-1.5 block text-[13px] font-medium text-ink-700">카테고리</span>
          <Select
            value={draft.category}
            disabled={locked}
            onChange={(e) => onPatch({ category: e.target.value })}
          >
            <option value="">미분류</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </Select>
        </label>

        <label>
          <span className="mb-1.5 block text-[13px] font-medium text-ink-700">보관 방법</span>
          <Select
            value={draft.storage}
            disabled={locked}
            onChange={(e) => onPatch({ storage: e.target.value as StorageType })}
          >
            {STORAGE_OPTIONS.map(([code, label]) => (
              <option key={code} value={code}>
                {label}
              </option>
            ))}
          </Select>
        </label>

        <label>
          <span className="mb-1.5 block text-[13px] font-medium text-ink-700">판매가 *</span>
          <Input
            inputMode="numeric"
            value={draft.price}
            disabled={locked}
            onChange={(e) => onPatch({ price: e.target.value })}
          />
          {issueOf("price") && <Help tone="error">{issueOf("price")}</Help>}
        </label>

        <label>
          <span className="mb-1.5 block text-[13px] font-medium text-ink-700">
            원가 (납품가)
          </span>
          <Input
            inputMode="numeric"
            value={draft.costPrice}
            disabled={locked}
            onChange={(e) => onPatch({ costPrice: e.target.value })}
          />
          {margin ? (
            <p className="krw mt-1 text-xs text-forest-700">{margin}</p>
          ) : (
            <Help>고객에게는 보이지 않습니다. 마진을 보려면 채워 주세요.</Help>
          )}
        </label>

        <label>
          <span className="mb-1.5 block text-[13px] font-medium text-ink-700">정가</span>
          <Input
            inputMode="numeric"
            value={draft.comparePrice}
            disabled={locked}
            onChange={(e) => onPatch({ comparePrice: e.target.value })}
          />
          <Help>판매가보다 높게 적으면 고객 화면에 할인 표시가 나옵니다.</Help>
        </label>

        <label>
          <span className="mb-1.5 block text-[13px] font-medium text-ink-700">초기 재고 *</span>
          <Input
            inputMode="numeric"
            value={draft.stock}
            disabled={locked}
            onChange={(e) => onPatch({ stock: e.target.value })}
          />
          {issueOf("stock") && <Help tone="error">{issueOf("stock")}</Help>}
        </label>

        <label>
          <span className="mb-1.5 block text-[13px] font-medium text-ink-700">원산지</span>
          <Input
            value={draft.origin}
            disabled={locked}
            onChange={(e) => onPatch({ origin: e.target.value })}
          />
        </label>

        <label>
          <span className="mb-1.5 block text-[13px] font-medium text-ink-700">중량·규격</span>
          <Input
            value={draft.weight}
            disabled={locked}
            placeholder="150g"
            onChange={(e) => onPatch({ weight: e.target.value })}
          />
        </label>

        <label>
          <span className="mb-1.5 block text-[13px] font-medium text-ink-700">포장 입수</span>
          <Input
            inputMode="numeric"
            value={draft.unitsPerPack}
            disabled={locked}
            onChange={(e) => onPatch({ unitsPerPack: e.target.value })}
          />
        </label>
      </div>
  );
}
