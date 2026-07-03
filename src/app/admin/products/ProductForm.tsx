"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import Tabs from "@/components/admin/Tabs";
import ConfirmDialog from "@/components/admin/ConfirmDialog";
import ImageUploader from "@/components/admin/ImageUploader";
import { Help } from "@/components/admin/Field";
import type { Category, ProductWithImages } from "@/lib/types";
import BasicTab from "./BasicTab";
import VariantsTab from "./VariantsTab";
import DetailTab from "./DetailTab";
import { BTN_GHOST, BTN_PRIMARY } from "./product-ui";
import {
  EMPTY_FORM,
  recordToRows,
  rowsToRecord,
  toInt,
  toIntOrNull,
  type FormState,
  type KvRow,
  type VariantDraft,
} from "./form-types";
import { slugify } from "@/lib/format";

const SLUG_RE = /^[a-z0-9가-힣]+(?:-[a-z0-9가-힣]+)*$/;

interface DetailResponse {
  product: ProductWithImages;
  hasOrders: boolean;
}

/** 상품 등록/편집 폼 — productId 없으면 신규 */
export default function ProductForm({ productId }: { productId?: string }) {
  const router = useRouter();
  const isNew = !productId;

  const [draftId] = useState(() =>
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : String(Date.now())
  );
  const imagePrefix = productId ?? `drafts/${draftId}`;

  const [tab, setTab] = useState("basic");
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [images, setImages] = useState<{ url: string }[]>([]);
  const [variants, setVariants] = useState<VariantDraft[]>([]);
  const [nutritionRows, setNutritionRows] = useState<KvRow[]>([]);
  const [specRows, setSpecRows] = useState<KvRow[]>([]);
  const [slugTouched, setSlugTouched] = useState(!isNew);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(!isNew);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hasOrders, setHasOrders] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [deleteStep, setDeleteStep] = useState<0 | 1 | 2>(0);

  const set = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
  }, []);

  const populate = useCallback((p: ProductWithImages) => {
    setForm({
      name: p.name,
      slug: p.slug,
      subtitle: p.subtitle ?? "",
      category_id: p.category_id ?? "",
      description: p.description ?? "",
      story: p.story ?? "",
      price: String(p.price),
      compare_at_price: p.compare_at_price != null ? String(p.compare_at_price) : "",
      cost_price: p.cost_price != null ? String(p.cost_price) : "",
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
    });
    setImages((p.product_images ?? []).map((img) => ({ url: img.url })));
    setVariants(
      (p.product_variants ?? []).map((v) => ({
        id: v.id,
        name: v.name,
        price_delta: String(v.price_delta),
        stock: String(v.stock),
        sku: v.sku ?? "",
        is_active: v.is_active,
      }))
    );
    setNutritionRows(recordToRows(p.nutrition));
    setSpecRows(recordToRows(p.specs));
  }, []);

  // 카테고리 옵션
  useEffect(() => {
    fetch("/api/admin/categories")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { categories: Category[] } | null) => {
        if (data) setCategories(data.categories);
      })
      .catch(() => undefined);
  }, []);

  // 편집 모드 — 상품 로드
  useEffect(() => {
    if (!productId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/admin/products/${productId}`);
        const data = (await res.json().catch(() => null)) as
          | (DetailResponse & { error?: string })
          | null;
        if (!res.ok || !data?.product) {
          throw new Error(data?.error ?? "상품을 불러오지 못했습니다.");
        }
        if (cancelled) return;
        populate(data.product);
        setHasOrders(data.hasOrders);
      } catch (e) {
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : "상품을 불러오지 못했습니다.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [productId, populate]);

  function handleNameChange(name: string) {
    setForm((f) => ({
      ...f,
      name,
      ...(isNew && !slugTouched ? { slug: slugify(name) } : {}),
    }));
  }

  function handleSlugChange(slug: string) {
    setSlugTouched(true);
    set("slug", slug);
  }

  function validate(): string | null {
    if (!form.name.trim()) return "상품명을 입력해 주세요.";
    const slug = form.slug.trim();
    if (!slug || !SLUG_RE.test(slug)) {
      return "URL 슬러그는 영문 소문자·숫자·한글·하이픈만 사용할 수 있습니다.";
    }
    const price = toIntOrNull(form.price);
    if (price == null || price < 0) return "판매가를 올바르게 입력해 주세요.";
    if (variants.some((v) => !v.name.trim())) return "옵션명을 모두 입력해 주세요.";
    return null;
  }

  async function save() {
    const invalid = validate();
    if (invalid) {
      setMessage({ tone: "error", text: invalid });
      return;
    }
    setSaving(true);
    setMessage(null);

    const payload = {
      product: {
        name: form.name.trim(),
        slug: form.slug.trim(),
        subtitle: form.subtitle.trim() || null,
        category_id: form.category_id || null,
        description: form.description.trim() || null,
        story: form.story.trim() || null,
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
      images: images.map((img) => ({ url: img.url })),
      variants: variants.map((v) => ({
        ...(v.id ? { id: v.id } : {}),
        name: v.name.trim(),
        price_delta: toInt(v.price_delta, 0),
        stock: Math.max(0, toInt(v.stock, 0)),
        sku: v.sku.trim() || null,
        is_active: v.is_active,
      })),
    };

    try {
      const res = await fetch(
        isNew ? "/api/admin/products" : `/api/admin/products/${productId}`,
        {
          method: isNew ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const data = (await res.json().catch(() => null)) as
        | { product?: ProductWithImages; warning?: string; error?: string }
        | null;
      if (!res.ok) throw new Error(data?.error ?? "저장에 실패했습니다.");

      if (isNew && data?.product) {
        router.replace(`/admin/products/${data.product.id}`);
        return;
      }
      if (data?.product) populate(data.product);
      setMessage(
        data?.warning
          ? { tone: "error", text: `저장되었지만 일부 항목에 문제가 있습니다: ${data.warning}` }
          : { tone: "ok", text: "저장되었습니다." }
      );
    } catch (e) {
      setMessage({
        tone: "error",
        text: e instanceof Error ? e.message : "저장에 실패했습니다.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function doDelete() {
    try {
      const res = await fetch(`/api/admin/products/${productId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? "삭제에 실패했습니다.");
      }
      router.replace("/admin/products");
    } catch (e) {
      setMessage({
        tone: "error",
        text: e instanceof Error ? e.message : "삭제에 실패했습니다.",
      });
    }
  }

  if (loadError) {
    return (
      <div className="py-24 text-center">
        <p className="headline-serif text-lg text-ink-500">{loadError}</p>
        <Link href="/admin/products" className={`${BTN_GHOST} mt-6 inline-block`}>
          상품 목록으로
        </Link>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-56 animate-pulse bg-cream-100" />
        <div className="h-10 w-full animate-pulse bg-cream-100" />
        <div className="h-64 w-full animate-pulse bg-cream-100" />
      </div>
    );
  }

  return (
    <div>
      {/* 헤더 */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <Link
            href="/admin/products"
            className="inline-flex items-center gap-1 text-xs text-ink-400 transition-colors hover:text-forest-700"
          >
            <ChevronLeft size={14} strokeWidth={1.5} />
            상품 목록
          </Link>
          <h1 className="mt-1 truncate text-xl font-semibold text-ink-900">
            {isNew ? "새 상품 등록" : form.name || "상품 편집"}
          </h1>
        </div>
      </div>

      {message && (
        <p
          role="status"
          className={`mb-4 border px-4 py-3 text-sm ${
            message.tone === "ok"
              ? "border-forest-200 bg-forest-50 text-forest-700"
              : "border-ink-200 bg-cream-100 text-signal-red"
          }`}
        >
          {message.text}
        </p>
      )}

      <Tabs
        tabs={[
          { key: "basic", label: "기본 정보" },
          { key: "images", label: "이미지", count: images.length },
          { key: "variants", label: "옵션", count: variants.length },
          { key: "detail", label: "상세·영양" },
        ]}
        active={tab}
        onChange={setTab}
        className="mb-6"
      />

      {/* 탭 콘텐츠 — 입력 상태 유지를 위해 모두 마운트 */}
      <div className={tab === "basic" ? "" : "hidden"}>
        <BasicTab
          form={form}
          set={set}
          onNameChange={handleNameChange}
          onSlugChange={handleSlugChange}
          categories={categories}
          isNew={isNew}
        />
      </div>

      <div className={tab === "images" ? "" : "hidden"}>
        <p className="mb-4 text-sm text-ink-600">
          첫 번째 이미지가 대표 이미지로 사용됩니다. 타일 하단 화살표로 순서를 바꿀 수 있습니다.
        </p>
        <ImageUploader value={images} onChange={setImages} bucket="products" prefix={imagePrefix} />
      </div>

      <div className={tab === "variants" ? "" : "hidden"}>
        <VariantsTab variants={variants} onChange={setVariants} isNew={isNew} />
      </div>

      <div className={tab === "detail" ? "" : "hidden"}>
        <DetailTab
          form={form}
          set={set}
          nutritionRows={nutritionRows}
          setNutritionRows={setNutritionRows}
          specRows={specRows}
          setSpecRows={setSpecRows}
        />
      </div>

      {/* 저장 바 */}
      <div className="sticky bottom-0 z-10 mt-10 flex flex-col gap-3 border-t border-ink-200 bg-cream-50 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          {!isNew && (
            <>
              <button
                type="button"
                onClick={() => setDeleteStep(1)}
                disabled={hasOrders || saving}
                className="text-sm text-ink-400 transition-colors hover:text-signal-red disabled:cursor-not-allowed disabled:opacity-50"
              >
                상품 삭제
              </button>
              {hasOrders && (
                <Help>주문 이력이 있어 삭제할 수 없습니다. 상태를 숨김으로 변경해 주세요.</Help>
              )}
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Link href="/admin/products" className={BTN_GHOST}>
            취소
          </Link>
          <button type="button" onClick={() => void save()} disabled={saving} className={BTN_PRIMARY}>
            {saving ? "저장 중…" : isNew ? "상품 등록" : "변경 사항 저장"}
          </button>
        </div>
      </div>

      {/* 삭제 컨펌 1단계 */}
      <ConfirmDialog
        open={deleteStep === 1}
        onClose={() => setDeleteStep((s) => (s === 1 ? 0 : s))}
        onConfirm={() => setDeleteStep(2)}
        title="상품 삭제"
        description={`'${form.name}' 상품을 삭제하시겠습니까?\n스토어에서 잠시 내리려면 삭제 대신 상태를 '숨김'으로 변경하는 것을 권장합니다.`}
        confirmLabel="계속"
      />

      {/* 삭제 컨펌 2단계 */}
      <ConfirmDialog
        open={deleteStep === 2}
        onClose={() => setDeleteStep(0)}
        onConfirm={doDelete}
        title="정말 삭제할까요?"
        description="삭제한 상품과 이미지·옵션·재고 이력은 복구할 수 없습니다. 계속하시겠습니까?"
        confirmLabel="영구 삭제"
        danger
      />
    </div>
  );
}
