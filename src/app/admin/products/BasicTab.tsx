"use client";

import { FieldRow, Input, Select, Toggle } from "@/components/admin/Field";
import { STORAGE_TYPE_LABELS } from "@/lib/constants";
import type { Category, ProductStatus, StorageType } from "@/lib/types";
import type { FormState } from "./form-types";
import { BADGE_OPTIONS, PRODUCT_STATUS_OPTIONS } from "./product-ui";

export interface BasicTabProps {
  form: FormState;
  set: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
  /** 상품명 입력 시 슬러그 자동 생성용 (수동 수정 후에는 비활성) */
  onNameChange: (name: string) => void;
  onSlugChange: (slug: string) => void;
  categories: Category[];
  isNew: boolean;
}

/** 기본 정보 탭 — 이름/slug/가격/재고/상태/보관/뱃지 등 */
export default function BasicTab({
  form,
  set,
  onNameChange,
  onSlugChange,
  categories,
  isNew,
}: BasicTabProps) {
  function toggleBadge(badge: string) {
    set(
      "badges",
      form.badges.includes(badge)
        ? form.badges.filter((b) => b !== badge)
        : [...form.badges, badge]
    );
  }

  return (
    <div className="divide-y divide-ink-100">
      <FieldRow label="상품명" required htmlFor="p-name">
        <Input
          id="p-name"
          value={form.name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="예: 발효곤약면 소면"
        />
      </FieldRow>

      <FieldRow
        label="URL 슬러그"
        required
        htmlFor="p-slug"
        help="상품 주소에 사용됩니다. 영문 소문자·숫자·한글·하이픈만 입력해 주세요."
      >
        <Input
          id="p-slug"
          value={form.slug}
          onChange={(e) => onSlugChange(e.target.value)}
          placeholder="fermented-konjac-noodle"
        />
      </FieldRow>

      <FieldRow label="서브타이틀" htmlFor="p-subtitle">
        <Input
          id="p-subtitle"
          value={form.subtitle}
          onChange={(e) => set("subtitle", e.target.value)}
          placeholder="목록 카드에 함께 표시되는 한 줄 소개"
        />
      </FieldRow>

      <FieldRow label="카테고리" htmlFor="p-category">
        <Select
          id="p-category"
          value={form.category_id}
          onChange={(e) => set("category_id", e.target.value)}
          className="max-w-60"
        >
          <option value="">미분류</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </FieldRow>

      <FieldRow label="가격" required help="정가를 입력하면 목록에 할인 표시가 됩니다. 원가는 관리자만 볼 수 있습니다.">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div>
            <Input
              inputMode="numeric"
              value={form.price}
              onChange={(e) => set("price", e.target.value)}
              placeholder="판매가"
              aria-label="판매가"
            />
            <p className="mt-1 text-xs text-ink-400">판매가 (원)</p>
          </div>
          <div>
            <Input
              inputMode="numeric"
              value={form.compare_at_price}
              onChange={(e) => set("compare_at_price", e.target.value)}
              placeholder="정가 (선택)"
              aria-label="정가"
            />
            <p className="mt-1 text-xs text-ink-400">정가 (원)</p>
          </div>
          <div>
            <Input
              inputMode="numeric"
              value={form.cost_price}
              onChange={(e) => set("cost_price", e.target.value)}
              placeholder="원가 (선택)"
              aria-label="원가"
            />
            <p className="mt-1 text-xs text-ink-400">원가 (원)</p>
          </div>
        </div>
      </FieldRow>

      <FieldRow label="SKU" htmlFor="p-sku">
        <Input
          id="p-sku"
          value={form.sku}
          onChange={(e) => set("sku", e.target.value)}
          placeholder="예: DL-KN-001"
          className="max-w-60"
        />
      </FieldRow>

      {isNew ? (
        <FieldRow
          label="최초 재고"
          htmlFor="p-stock"
          help="등록 이후의 재고 변경은 재고 관리 화면에서 입고/조정으로 처리합니다."
        >
          <Input
            id="p-stock"
            inputMode="numeric"
            value={form.stock}
            onChange={(e) => set("stock", e.target.value)}
            className="max-w-40"
          />
        </FieldRow>
      ) : (
        <FieldRow label="재고" help="재고 수량은 재고 관리 화면에서 입고/조정으로 변경합니다.">
          <p className="pt-2.5 text-sm text-ink-600 krw">{form.stock}개</p>
        </FieldRow>
      )}

      <FieldRow
        label="재고 임계치"
        htmlFor="p-threshold"
        help="재고가 이 수량 이하로 내려가면 목록에서 품절 임박으로 강조됩니다."
      >
        <Input
          id="p-threshold"
          inputMode="numeric"
          value={form.low_stock_threshold}
          onChange={(e) => set("low_stock_threshold", e.target.value)}
          className="max-w-40"
        />
      </FieldRow>

      <FieldRow label="판매 상태" htmlFor="p-status">
        <Select
          id="p-status"
          value={form.status}
          onChange={(e) => set("status", e.target.value as ProductStatus)}
          className="max-w-40"
        >
          {PRODUCT_STATUS_OPTIONS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </FieldRow>

      <FieldRow label="보관 방법" htmlFor="p-storage">
        <Select
          id="p-storage"
          value={form.storage_type}
          onChange={(e) => set("storage_type", e.target.value as StorageType)}
          className="max-w-40"
        >
          {(Object.entries(STORAGE_TYPE_LABELS) as [StorageType, string][]).map(
            ([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            )
          )}
        </Select>
      </FieldRow>

      <FieldRow label="원산지" htmlFor="p-origin">
        <Input
          id="p-origin"
          value={form.origin}
          onChange={(e) => set("origin", e.target.value)}
          placeholder="예: 국내산 (경기 고양)"
          className="max-w-72"
        />
      </FieldRow>

      <FieldRow label="중량 표기" htmlFor="p-weight">
        <Input
          id="p-weight"
          value={form.weight}
          onChange={(e) => set("weight", e.target.value)}
          placeholder="예: 200g × 2입"
          className="max-w-72"
        />
      </FieldRow>

      <FieldRow label="구성 수량" htmlFor="p-units">
        <Input
          id="p-units"
          inputMode="numeric"
          value={form.units_per_pack}
          onChange={(e) => set("units_per_pack", e.target.value)}
          className="max-w-40"
        />
      </FieldRow>

      <FieldRow label="뱃지" help="여러 개를 동시에 선택할 수 있습니다.">
        <div className="flex flex-wrap gap-2 pt-1">
          {BADGE_OPTIONS.map((badge) => {
            const on = form.badges.includes(badge);
            return (
              <button
                key={badge}
                type="button"
                aria-pressed={on}
                onClick={() => toggleBadge(badge)}
                className={`rounded-full border px-3.5 py-1.5 text-xs transition-colors ${
                  on
                    ? "border-forest-700 bg-forest-700 text-cream-50"
                    : "border-ink-200 bg-cream-50 text-ink-600 hover:border-forest-600 hover:text-forest-700"
                }`}
              >
                {badge}
              </button>
            );
          })}
        </div>
      </FieldRow>

      <FieldRow label="태그" htmlFor="p-tags" help="쉼표(,)로 구분해 입력해 주세요.">
        <Input
          id="p-tags"
          value={form.tags}
          onChange={(e) => set("tags", e.target.value)}
          placeholder="예: 저칼로리, 비건, 글루텐프리"
        />
      </FieldRow>

      <FieldRow label="추천 상품" help="홈 화면 추천 영역에 노출됩니다.">
        <Toggle
          checked={form.is_featured}
          onChange={(v) => set("is_featured", v)}
          label="추천 상품으로 노출"
        />
      </FieldRow>

      <FieldRow label="노출 순서" htmlFor="p-sort" help="숫자가 작을수록 목록 앞쪽에 표시됩니다.">
        <Input
          id="p-sort"
          inputMode="numeric"
          value={form.sort_order}
          onChange={(e) => set("sort_order", e.target.value)}
          className="max-w-40"
        />
      </FieldRow>
    </div>
  );
}
