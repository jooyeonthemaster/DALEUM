/* ============================================================
   서버가 준 상품 한 건 → 폼이 다루는 한 덩어리.

   불러오기와 '변경됨' 판정의 기준선을 **같은 함수**로 만든다. 두 곳에서 따로 만들면
   한쪽에만 필드를 더하는 날 그 필드는 영원히 '변경 없음' 으로 취급된다
   (실제로 브랜드·공급처가 그런 식으로 빠져 있었다).
   ============================================================ */

import { docFromLegacyMarkdown, parseDetailDocJson } from "@/lib/detail-doc-v2";
import type { ProductWithImages } from "@/lib/types";
import { recordToRows } from "../form-types";
import type { ProductFormSnapshot } from "./draft-storage";

export function snapshotFromProduct(p: ProductWithImages): ProductFormSnapshot {
  return {
    form: {
      name: p.name,
      slug: p.slug,
      subtitle: p.subtitle ?? "",
      category_id: p.category_id ?? "",
      story: p.story ?? "",
      price: String(p.price),
      compare_at_price: p.compare_at_price != null ? String(p.compare_at_price) : "",
      cost_price: p.cost_price != null ? String(p.cost_price) : "",
      brand: p.brand ?? "",
      supplier: p.supplier ?? "",
      sku: p.sku ?? "",
      stock: String(p.stock),
      low_stock_threshold: String(p.low_stock_threshold),
      status: p.status,
      storage_type: p.storage_type,
      origin: p.origin ?? "",
      weight: p.weight ?? "",
      units_per_pack: String(p.units_per_pack),
      badges: p.badges ?? [],
      tags: (p.tags ?? []).join(", "),
      is_featured: p.is_featured,
      sort_order: String(p.sort_order),
    },
    /* 상세페이지 문서. 새 편집기로 저장한 적이 있으면 그 문서를 그대로 쓰고,
       없으면 레거시 마크다운에서 읽어 온다(그때 모든 글은 lead 로 표시돼
       고객 화면이 오늘과 똑같이 유지된다 — detail-doc-v2.ts 머리말 참고). */
    detailDoc:
      parseDetailDocJson(p.description_doc) ?? docFromLegacyMarkdown(p.description),
    // alt 를 버리면 저장할 때 서버가 상품명으로 덮어쓴다 — 사람이 적어 둔 사진 설명이 사라진다.
    images: (p.product_images ?? []).map((img) => ({ url: img.url, alt: img.alt })),
    variants: (p.product_variants ?? []).map((v) => ({
      id: v.id,
      name: v.name,
      price_delta: String(v.price_delta),
      stock: String(v.stock),
      /* 화면을 연 순간의 재고. 저장할 때 서버가 DB 현재값과 대조해, 그 사이 팔린 수량을
         되살리지 않고 경고만 준다(되살리면 없는 물건을 파는 초과판매가 된다). */
      expectedStock: v.stock,
      sku: v.sku ?? "",
      is_active: v.is_active,
    })),
    nutritionRows: recordToRows(p.nutrition),
    specRows: recordToRows(p.specs),
  };
}
