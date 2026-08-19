"use client";

/* ============================================================
   상품 담기 — 여러 개를 한 번에 고르는 모달.

   왜 만들었나:
   예전에는 검색창 하나로 한 건씩만 담을 수 있었고, 검색어를 치기 전에는
   아무것도 보이지 않았다(서버도 10건에서 잘랐다). 상품 27개 중 20개를 담는
   명절 기획전을 만들려면 상품명을 스무 번 정확히 기억해 검색해야 했고,
   결국 개발자에게 스크립트를 부탁하던 예전 방식으로 되돌아갔다.

   이제 검색어 없이 전부 훑어볼 수 있고, 분류로 좁힐 수 있고, 체크박스로
   여러 개를 한 번에 담는다. 원가도 함께 보여 준다 — 캠페인가·전용가를 정할 때
   그 값이 원가 아래인지 이 화면에서 판단할 수 있어야 하기 때문이다.
   ============================================================ */

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Modal from "@/components/admin/Modal";
import Pagination from "@/components/admin/Pagination";
import { Input, Select } from "@/components/admin/Field";
import { PRICE_LABELS, VIP_BASE_PRICE_LABEL, won } from "@/lib/admin-labels";
import {
  api,
  BTN_GHOST,
  BTN_PRIMARY,
  productStatusLabel,
  type CategoryHit,
  type ProductHit,
  type ProductPage,
} from "./vipApi";

const PAGE_SIZE = 12;

export interface ProductPickerModalProps {
  open: boolean;
  onClose: () => void;
  /** 고른 상품들을 한 번에 넘긴다 */
  onAdd: (products: ProductHit[]) => void;
  /** 이미 담긴 상품 — 목록에서 '담김'으로 잠근다 */
  excludeIds: string[];
}

export default function ProductPickerModal({
  open,
  onClose,
  onAdd,
  excludeIds,
}: ProductPickerModalProps) {
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<ProductPage | null>(null);
  const [categories, setCategories] = useState<CategoryHit[]>([]);
  const [picked, setPicked] = useState<Record<string, ProductHit>>({});
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (q: string, category: string, nextPage: number) => {
    try {
      const params = new URLSearchParams({
        page: String(nextPage),
        page_size: String(PAGE_SIZE),
      });
      if (q.trim()) params.set("q", q.trim());
      if (category) params.set("category_id", category);
      const data = await api<ProductPage>(`/api/admin/vip/products-search?${params}`);
      setResult(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "상품 목록을 불러오지 못했습니다.");
      setResult({ products: [], total: 0, page: 1, page_size: PAGE_SIZE });
    }
  }, []);

  // 모달이 열려 있는 동안에만 읽는다. 검색어는 300ms 쉬었다 보낸다(타건마다 호출 방지).
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => void load(query, categoryId, page), query ? 300 : 0);
    return () => clearTimeout(timer);
  }, [open, query, categoryId, page, load]);

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      api<{ categories: CategoryHit[] }>("/api/admin/vip/categories")
        .then((data) => setCategories(data.categories))
        .catch(() => setCategories([]));
    }, 0);
    return () => clearTimeout(timer);
  }, [open]);

  // result 가 null 일 때 매 렌더마다 새 배열이 생기면 아래 useMemo 가 헛돌아 경고가 난다
  const rows = useMemo(() => result?.products ?? [], [result]);
  const selectableRows = useMemo(
    () => rows.filter((p) => !excludeIds.includes(p.id)),
    [rows, excludeIds]
  );
  const pickedList = useMemo(() => Object.values(picked), [picked]);
  const allPicked =
    selectableRows.length > 0 && selectableRows.every((p) => Boolean(picked[p.id]));

  function toggle(product: ProductHit) {
    setPicked((prev) => {
      const next = { ...prev };
      if (next[product.id]) delete next[product.id];
      else next[product.id] = product;
      return next;
    });
  }

  function toggleAllOnPage() {
    setPicked((prev) => {
      const next = { ...prev };
      if (allPicked) {
        for (const p of selectableRows) delete next[p.id];
      } else {
        for (const p of selectableRows) next[p.id] = p;
      }
      return next;
    });
  }

  function reset() {
    setPicked({});
    setQuery("");
    setCategoryId("");
    setPage(1);
    setResult(null);
    setError(null);
  }

  function close() {
    reset();
    onClose();
  }

  function confirm() {
    if (pickedList.length === 0) return;
    onAdd(pickedList);
    reset();
    onClose();
  }

  const totalPages = Math.max(1, Math.ceil((result?.total ?? 0) / PAGE_SIZE));

  return (
    <Modal
      open={open}
      onClose={close}
      title="상품 담기"
      size="lg"
      footer={
        <>
          <button type="button" onClick={close} className={BTN_GHOST}>
            취소
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={pickedList.length === 0}
            className={BTN_PRIMARY}
          >
            {pickedList.length > 0 ? `${pickedList.length}개 담기` : "담기"}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            placeholder="상품명으로 좁히기 (비워 두면 전체)"
            aria-label="상품명 검색"
          />
          <Select
            value={categoryId}
            onChange={(e) => {
              setCategoryId(e.target.value);
              setPage(1);
            }}
            className="sm:w-52"
            aria-label="분류 좁히기"
          >
            <option value="">전체 분류</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-ink-500">
            전체 <span className="krw">{result?.total ?? 0}</span>개 중{" "}
            <span className="krw">{rows.length}</span>개 표시
            {pickedList.length > 0 && ` · 고른 상품 ${pickedList.length}개`}
          </p>
          <button
            type="button"
            onClick={toggleAllOnPage}
            disabled={selectableRows.length === 0}
            className="text-xs text-forest-700 underline-offset-2 transition-colors hover:underline disabled:text-ink-300 disabled:no-underline"
          >
            {allPicked ? "이 페이지 선택 해제" : "이 페이지 전체 선택"}
          </button>
        </div>

        {error && <p className="text-sm text-signal-red">{error}</p>}

        <ul className="divide-y divide-ink-100 border border-ink-200">
          {result === null ? (
            <li className="px-3 py-8 text-center text-sm text-ink-400">불러오는 중…</li>
          ) : rows.length === 0 ? (
            <li className="px-3 py-8 text-center text-sm text-ink-400">
              조건에 맞는 상품이 없습니다.
            </li>
          ) : (
            rows.map((product) => {
              const already = excludeIds.includes(product.id);
              const checked = Boolean(picked[product.id]);
              return (
                <li key={product.id}>
                  <label
                    className={`flex items-center gap-3 px-3 py-2.5 ${
                      already ? "cursor-not-allowed opacity-45" : "cursor-pointer hover:bg-cream-100"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={already}
                      onChange={() => toggle(product)}
                      className="size-4 shrink-0 accent-forest-700"
                    />
                    <span className="relative block size-10 shrink-0 overflow-hidden border border-ink-200 bg-cream-100">
                      {product.image_url && (
                        <Image
                          src={product.image_url}
                          alt=""
                          fill
                          sizes="40px"
                          className="object-cover"
                        />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-ink-900">{product.name}</span>
                      <span className="krw block text-xs text-ink-400">
                        {VIP_BASE_PRICE_LABEL} {won(product.price)}
                        {product.cost_price != null && ` · ${PRICE_LABELS.cost} ${won(product.cost_price)}`}
                        {product.status !== "active" && (
                          <span className="ml-1.5 text-signal-amber">
                            {productStatusLabel(product.status)}
                          </span>
                        )}
                      </span>
                    </span>
                    {already && <span className="shrink-0 text-xs text-ink-400">이미 담김</span>}
                  </label>
                </li>
              );
            })
          )}
        </ul>

        {totalPages > 1 && (
          <Pagination page={result?.page ?? 1} totalPages={totalPages} onChange={setPage} />
        )}
      </div>
    </Modal>
  );
}
