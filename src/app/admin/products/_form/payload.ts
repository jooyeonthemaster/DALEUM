/* ============================================================
   폼 상태 → 서버로 보낼 꾸러미.

   화면 값은 전부 문자열이고 서버는 숫자를 받는다. 그 사이 변환을 저장 함수 안에 섞어 두면
   '어느 칸이 어떤 규칙으로 숫자가 되는지' 가 저장 로직에 묻혀 보이지 않는다.
   변환은 여기 한곳에 모으고, 숫자로 못 읽히는 값은 여기 오기 전에 검사(validate.ts)가 막는다.
   ============================================================ */

import { isEmptyDoc, serializeDetailDoc, type DetailBlock } from "@/lib/detail-doc";
import { rowsToRecord, toInt, toIntOrNull, type FormState, type KvRow, type VariantDraft } from "../form-types";
import type { ProductImageDraft } from "./draft-storage";

export interface BuildPayloadInput {
  form: FormState;
  images: ProductImageDraft[];
  detailBlocks: DetailBlock[];
  variants: VariantDraft[];
  nutritionRows: KvRow[];
  specRows: KvRow[];
  isNew: boolean;
}

export function buildPayload({
  form,
  images,
  detailBlocks,
  variants,
  nutritionRows,
  specRows,
  isNew,
}: BuildPayloadInput) {
  return {
    product: {
      name: form.name.trim(),
      slug: form.slug.trim(),
      subtitle: form.subtitle.trim() || null,
      category_id: form.category_id || null,
      description: isEmptyDoc(detailBlocks) ? null : serializeDetailDoc(detailBlocks),
      story: form.story.trim() || null,
      // 브랜드는 고객 상세페이지 표기용, 공급처는 관리자 식별용이다. 둘 다 0003 마이그레이션으로
      // 들어온 컬럼인데 폼에서 보내지 않아, 입력칸을 만들어도 저장되지 않던 자리다.
      brand: form.brand?.trim() || null,
      supplier: form.supplier?.trim() || null,
      price: toInt(form.price, 0),
      compare_at_price: toIntOrNull(form.compare_at_price),
      cost_price: toIntOrNull(form.cost_price),
      sku: form.sku.trim() || null,
      low_stock_threshold: Math.max(0, toInt(form.low_stock_threshold, 10)),
      status: form.status,
      storage_type: form.storage_type,
      origin: form.origin.trim() || null,
      weight: form.weight.trim() || null,
      units_per_pack: Math.max(1, toInt(form.units_per_pack, 1)),
      badges: form.badges,
      tags: form.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      nutrition: rowsToRecord(nutritionRows),
      specs: rowsToRecord(specRows),
      is_featured: form.is_featured,
      sort_order: toInt(form.sort_order, 0),
      ...(isNew ? { stock: Math.max(0, toInt(form.stock, 0)) } : {}),
    },
    // 사진 설명(alt)을 그대로 실어 보낸다. 안 보내면 서버가 상품명으로 채워 버려서,
    // 아무것도 고치지 않고 저장만 눌러도 '영양성분표' 같은 설명이 전부 상품명으로 덮어써졌다.
    images: images.map((img) => ({ url: img.url, ...(img.alt ? { alt: img.alt } : {}) })),
    variants: variants.map((v) => ({
      ...(v.id ? { id: v.id } : {}),
      name: v.name.trim(),
      price_delta: toInt(v.price_delta, 0),
      // 기존 옵션의 재고는 화면에서 못 고치므로 화면을 열었을 때의 값을 그대로 되돌려 보낸다.
      // 서버는 expected_stock 과 DB 현재값을 대조해, 그 사이 팔린 재고를 되살리지 않고 경고만 준다.
      stock: Math.max(0, toInt(v.stock, 0)),
      expected_stock: v.expectedStock,
      sku: v.sku.trim() || null,
      is_active: v.is_active,
    })),
  };
}
