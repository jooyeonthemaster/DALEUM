"use client";

/* ============================================================
   고객 화면 미리보기 — 저장하기 전에 '지금 이대로면 고객이 무엇을 보는지' 를 보여 준다.

   중요한 원칙: 관리자용으로 비슷하게 다시 그리지 않는다. 고객 화면이 실제로 쓰는 카드
   컴포넌트(components/shop/ProductCard)를 **그대로 읽기 전용으로** 불러 렌더한다.
   비슷하게 다시 그리면 언젠가 어긋나고, 어긋난 그림을 보고 판단하는 것이 확인을 안 하는 것보다 나쁘다.

   상세페이지 본문 미리보기는 상세·영양 탭 안에 따로 있다(칸 편집기의 '고객 화면으로 보기').
   여기서는 목록·검색·홈에서 가장 먼저 보이는 카드와, 그 카드가 말하는 값들을 확인한다.
   ============================================================ */

import Modal from "@/components/admin/Modal";
import ProductCard from "@/components/shop/ProductCard";
import type { Category, ProductCardRow } from "@/lib/types";
import { krw } from "@/lib/format";
import { parseNumberField, type FormState } from "../form-types";
import type { ProductImageDraft } from "./draft-storage";

export interface PreviewModalProps {
  open: boolean;
  onClose: () => void;
  form: FormState;
  images: ProductImageDraft[];
  categories: Category[];
  /** 옵션이 있으면 재고 판정이 상품 재고와 달라 보일 수 있어 따로 알려 준다 */
  variantCount: number;
}

/** 폼 문자열 → 카드가 기대하는 숫자 (못 읽는 값은 0 으로 보여 주고, 그 사실은 아래 안내가 말한다) */
function num(v: string): number {
  const parsed = parseNumberField(v);
  return parsed.kind === "ok" ? parsed.value : 0;
}

export default function PreviewModal({
  open,
  onClose,
  form,
  images,
  categories,
  variantCount,
}: PreviewModalProps) {
  const category = categories.find((c) => c.id === form.category_id) ?? null;
  const price = num(form.price);
  const compareAt = form.compare_at_price.trim() === "" ? null : num(form.compare_at_price);

  const preview: ProductCardRow = {
    id: "preview",
    slug: form.slug,
    name: form.name || "(상품명을 아직 넣지 않았습니다)",
    subtitle: form.subtitle.trim() || null,
    category_id: form.category_id || null,
    brand: form.brand?.trim() || null,
    price,
    compare_at_price: compareAt,
    sku: form.sku.trim() || null,
    stock: num(form.stock),
    low_stock_threshold: num(form.low_stock_threshold),
    status: form.status,
    storage_type: form.storage_type,
    origin: form.origin.trim() || null,
    weight: form.weight.trim() || null,
    units_per_pack: num(form.units_per_pack),
    badges: form.badges,
    tags: form.tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean),
    is_featured: form.is_featured,
    sort_order: num(form.sort_order),
    view_count: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    product_images: images.map((img, i) => ({
      id: `preview-${i}`,
      product_id: "preview",
      url: img.url,
      alt: img.alt ?? form.name,
      sort_order: i,
      is_primary: i === 0,
      created_at: new Date().toISOString(),
    })),
    categories: category ? { id: category.id, slug: category.slug, name: category.name } : null,
  };

  const hiddenFromCustomers = form.status === "draft" || form.status === "hidden";
  const soldOutInPreview = form.status === "sold_out" || preview.stock <= 0;

  return (
    <Modal open={open} onClose={onClose} title="고객 화면 미리보기" size="lg">
      <div className="grid gap-6 md:grid-cols-[minmax(0,15rem)_1fr]">
        <div>
          <p className="mb-2 text-xs text-ink-400">목록·검색·홈에 나가는 카드</p>
          {/* 미리보기 안에서 상품 페이지로 튀어 나가지 않도록 클릭을 통째로 막는다 */}
          <div className="pointer-events-none select-none">
            <ProductCard product={preview} />
          </div>
        </div>

        <div className="space-y-3 text-sm leading-relaxed text-ink-600">
          <p className="text-ink-900">
            지금 화면에 채워 넣은 값으로 그린 것입니다. 저장하지 않은 내용도 그대로 반영됩니다.
          </p>

          {images.length === 0 && (
            <p className="text-signal-amber">
              사진이 한 장도 없어 카드가 빈 자리로 보입니다. 이미지 탭에서 상품컷을 올려 주세요.
            </p>
          )}

          {hiddenFromCustomers && (
            <p className="text-signal-amber">
              지금 판매 상태로는 이 카드가 고객 화면 어디에도 나가지 않습니다. 판매를 시작하려면
              기본 정보 탭에서 판매 상태를 &lsquo;판매중&rsquo; 으로 바꿔 주세요.
            </p>
          )}

          {soldOutInPreview && (
            <p className="text-signal-amber">
              카드에 &lsquo;일시 품절&rsquo; 이 덮여 보입니다
              {variantCount > 0
                ? " — 옵션에 재고를 넣어도 상품 자체의 재고가 0개면 고객은 주문할 수 없습니다. 재고 관리 화면에서 상품 재고를 채워 주세요."
                : " — 재고가 0개이기 때문입니다."}
            </p>
          )}

          {compareAt !== null && compareAt > price && (
            <p>
              고객에게는 정가 {krw(compareAt)}원에 취소선이 그어지고, 할인율이 함께 표시됩니다.
            </p>
          )}

          <p className="text-xs text-ink-400">
            상세페이지 본문(사진·설명)이 어떻게 실리는지는 상세·영양 탭의 &lsquo;고객 화면으로 보기&rsquo; 에서
            확인할 수 있습니다.
          </p>
        </div>
      </div>
    </Modal>
  );
}
