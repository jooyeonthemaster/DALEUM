"use client";

import { FieldRow, Help, Input, Select, Toggle } from "@/components/admin/Field";
import { STORAGE_TYPE_LABELS } from "@/lib/constants";
import type { Category, ProductStatus, StorageType } from "@/lib/types";
import { formatNumberForInput, parseNumberField, type FormState } from "./form-types";
import {
  BRAND_SUGGESTIONS,
  PRODUCT_STATUS_HELP,
  PRODUCT_STATUS_OPTIONS,
  PRODUCT_STATUS_WARNS,
  SUPPLIER_SUGGESTIONS,
} from "./product-ui";
import BadgePicker from "./_basic/BadgePicker";
import NumberField from "./_basic/NumberField";
import PriceSection from "./_basic/PriceSection";
import ProductAddressField from "./_basic/ProductAddressField";

export interface BasicTabProps {
  form: FormState;
  set: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
  /** 상품명 입력 시 주소 자동 생성용 (직접 고친 뒤에는 비활성) */
  onNameChange: (name: string) => void;
  onSlugChange: (slug: string) => void;
  categories: Category[];
  /** 아직 카테고리 응답을 기다리는 중 — '실패' 와 반드시 구분해서 보여 준다 */
  categoriesLoading: boolean;
  /** 카테고리 요청이 실제로 실패했다 */
  categoriesFailed: boolean;
  isNew: boolean;
  /** 상품 주소 칸을 펼쳐 두었는가 — 저장 실패 후 오류 문구를 눌러 이 칸으로 올 때 부모가 열어 준다 */
  addressOpen: boolean;
  onAddressOpenChange: (open: boolean) => void;
}

/* 서버(shared.ts → cleanStr)가 말없이 잘라 내는 한도.
   화면에 한도를 적어 두지 않으면, 한 줄 소개를 길게 쓴 사람은 저장한 뒤에야 문장이 잘린 걸 발견한다. */
const NAME_MAX = 200;
const SUBTITLE_MAX = 300;

/** 글자 수 — 한도의 80%를 넘겼을 때만 보여 준다(평소엔 눈에 거슬리기만 하니까) */
function CharCount({ value, max }: { value: string; max: number }) {
  if (value.length < max * 0.8) return null;
  const over = value.length >= max;
  return (
    <p className={`mt-1.5 text-xs ${over ? "text-signal-red" : "text-ink-400"}`}>
      {value.length} / {max}자{over ? " — 여기서 더 넣으면 저장할 때 뒷부분이 잘립니다." : ""}
    </p>
  );
}

/**
 * 숫자로 못 읽는 값을 알리는 한 줄.
 *
 * 가격 칸(PriceSection)은 예전부터 이 문구를 띄웠는데 재고·임계치·구성 수량·노출 순서는
 * 빨간 테두리조차 없었다. 같은 실수인데 칸마다 다르게 보이면 관리자는 어느 칸이 문제인지
 * 저장을 눌러 보기 전까지 알 수 없다 — 문구도 표시도 가격 칸과 똑같이 맞춘다.
 */
function NumberNote() {
  return (
    <p className="mt-1.5 text-xs leading-relaxed text-signal-red">
      숫자로 읽을 수 없습니다. 숫자만 넣어 주세요.
    </p>
  );
}

/** 기본 정보 탭 — 이름/주소/브랜드/가격/재고/상태/보관/뱃지 등 */
export default function BasicTab({
  form,
  set,
  onNameChange,
  onSlugChange,
  categories,
  categoriesLoading,
  categoriesFailed,
  isNew,
  addressOpen,
  onAddressOpenChange,
}: BasicTabProps) {
  const statusHelp = PRODUCT_STATUS_HELP[form.status];
  const statusWarn = PRODUCT_STATUS_WARNS.includes(form.status);

  /* 숫자 칸의 '못 읽음' 판정은 저장 검사(validate.ts)와 같은 parseNumberField 를 쓴다.
     화면과 저장 검사가 서로 다른 잣대를 쓰면, 빨간 표시가 없는 칸 때문에 저장이 막히는 일이 생긴다. */
  const stockInvalid = parseNumberField(form.stock).kind === "invalid";
  const thresholdInvalid = parseNumberField(form.low_stock_threshold).kind === "invalid";
  const unitsInvalid = parseNumberField(form.units_per_pack).kind === "invalid";
  const sortInvalid = parseNumberField(form.sort_order).kind === "invalid";

  return (
    <div className="divide-y divide-ink-100">
      <FieldRow label="상품명" required htmlFor="p-name">
        <Input
          id="p-name"
          value={form.name}
          maxLength={NAME_MAX}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="예: 발효곤약면 소면"
        />
        <CharCount value={form.name} max={NAME_MAX} />
      </FieldRow>

      <FieldRow label="상품 주소" required>
        <ProductAddressField
          value={form.slug}
          onChange={onSlugChange}
          isNew={isNew}
          open={addressOpen}
          onOpenChange={onAddressOpenChange}
          /* 상품명조차 아직 없는 새 폼에서는 주소가 비어 있는 게 정상이다(상품명을 치면 자동으로 채워진다).
             상품명이 들어왔는데도 주소가 비어 있다면 그때는 저장을 막는 진짜 오류다 —
             예전에는 신규 등록에서 이 경고를 통째로 껐던 탓에, 저장을 막는 유일한 칸이
             화면상 아무 문제 없어 보였다. */
          showEmptyError={!isNew || form.name.trim() !== ""}
        />
      </FieldRow>

      <FieldRow label="한 줄 소개" htmlFor="p-subtitle">
        <Input
          id="p-subtitle"
          value={form.subtitle}
          maxLength={SUBTITLE_MAX}
          onChange={(e) => set("subtitle", e.target.value)}
          placeholder="목록 카드에 함께 표시되는 한 줄 소개"
        />
        <CharCount value={form.subtitle} max={SUBTITLE_MAX} />
      </FieldRow>

      <FieldRow
        label="브랜드"
        htmlFor="p-brand"
        help="패키지에 인쇄된 이름입니다. 고객 상세페이지에 그대로 표시됩니다. 목록에 없으면 직접 적어 주세요."
      >
        <Input
          id="p-brand"
          list="p-brand-suggestions"
          value={form.brand ?? ""}
          onChange={(e) => set("brand", e.target.value)}
          placeholder="예: 마틴조"
          className="max-w-60"
        />
        <datalist id="p-brand-suggestions">
          {BRAND_SUGGESTIONS.map((b) => (
            <option key={b} value={b} />
          ))}
        </datalist>
      </FieldRow>

      <FieldRow
        label="공급처"
        htmlFor="p-supplier"
        help="이 상품을 어디서 받아 오는지 구분하는 관리자 전용 항목입니다. 고객에게는 보이지 않습니다."
      >
        <Input
          id="p-supplier"
          list="p-supplier-suggestions"
          value={form.supplier ?? ""}
          onChange={(e) => set("supplier", e.target.value)}
          placeholder="예: 수다락"
          className="max-w-60"
        />
        <datalist id="p-supplier-suggestions">
          {SUPPLIER_SUGGESTIONS.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      </FieldRow>

      <FieldRow label="카테고리" htmlFor="p-category">
        <Select
          id="p-category"
          value={form.category_id}
          onChange={(e) => set("category_id", e.target.value)}
          disabled={categoriesLoading}
          className="max-w-60"
        >
          <option value="">미분류</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        {/* 예전에는 '길이 0' 하나로 실패를 단정해서, 폼을 열 때마다 응답이 오기 전 한 박자 동안
            새로고침을 지시하는 붉은 오류가 떴다 — 작성 중이던 사람에게는 위험한 거짓말이다.
            불러오는 중 / 실패 / 정상을 각각 다르게 말한다. */}
        {categoriesLoading ? (
          <Help>카테고리를 불러오는 중입니다.</Help>
        ) : categoriesFailed ? (
          // 목록을 못 불러와도 셀렉트는 「미분류」 하나짜리 정상 화면처럼 보인다 — 그래서 따로 말해 준다.
          <Help tone="error">
            카테고리 목록을 불러오지 못했습니다. 화면을 새로고침한 뒤 다시 골라 주세요.
          </Help>
        ) : (
          form.category_id === "" && (
            <p className="mt-1.5 text-xs leading-relaxed text-signal-amber">
              카테고리를 정하지 않으면 카테고리 페이지에 걸리지 않아 고객이 찾기 어렵습니다.
            </p>
          )
        )}
      </FieldRow>

      <FieldRow label="가격">
        <PriceSection form={form} set={set} />
      </FieldRow>

      <FieldRow
        label="상품 코드"
        htmlFor="p-sku"
        help="창고·발주에서 이 상품을 가리키는 관리용 번호입니다. 비워 두어도 되고, 다른 상품이 쓰는 번호와 겹치면 저장이 막힙니다."
      >
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
          <NumberField
            id="p-stock"
            value={form.stock}
            onChange={(v) => set("stock", v)}
            suffix="개"
            invalid={stockInvalid}
            className="max-w-40"
          />
          {stockInvalid && <NumberNote />}
        </FieldRow>
      ) : (
        <FieldRow label="재고" help="재고 수량은 재고 관리 화면에서 입고/조정으로 변경합니다.">
          <p className="krw pt-2.5 text-sm text-ink-600">{formatNumberForInput(form.stock)}개</p>
        </FieldRow>
      )}

      <FieldRow
        label="재고 임계치"
        htmlFor="p-threshold"
        help="재고가 이 수량 이하로 내려가면 목록에서 품절 임박으로 강조됩니다."
      >
        <NumberField
          id="p-threshold"
          value={form.low_stock_threshold}
          onChange={(v) => set("low_stock_threshold", v)}
          suffix="개"
          invalid={thresholdInvalid}
          className="max-w-40"
        />
        {thresholdInvalid && <NumberNote />}
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
        {statusWarn ? (
          <p className="mt-1.5 text-xs leading-relaxed text-signal-amber">{statusHelp}</p>
        ) : (
          <Help>{statusHelp}</Help>
        )}
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

      <FieldRow
        label="구성 수량"
        htmlFor="p-units"
        help="한 상품 안에 몇 개가 들어 있는지입니다. 낱개로 파는 상품이면 1로 두세요."
      >
        <NumberField
          id="p-units"
          value={form.units_per_pack}
          onChange={(v) => set("units_per_pack", v)}
          suffix="입"
          invalid={unitsInvalid}
          className="max-w-40"
        />
        {unitsInvalid && <NumberNote />}
      </FieldRow>

      <FieldRow label="뱃지">
        <BadgePicker value={form.badges} onChange={(next) => set("badges", next)} />
      </FieldRow>

      <FieldRow
        label="태그"
        htmlFor="p-tags"
        help="쉼표(,)로 구분해 입력해 주세요. 최대 20개, 한 개당 30자까지 저장됩니다."
      >
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
        <NumberField
          id="p-sort"
          value={form.sort_order}
          onChange={(v) => set("sort_order", v)}
          invalid={sortInvalid}
          className="max-w-40"
        />
        {sortInvalid && <NumberNote />}
      </FieldRow>
    </div>
  );
}
