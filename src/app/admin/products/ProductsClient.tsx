"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import DataTable, { type DataTableColumn } from "@/components/admin/DataTable";
import Pagination from "@/components/admin/Pagination";
import SearchInput from "@/components/admin/SearchInput";
import { Select } from "@/components/admin/Field";
import { krw, formatDate } from "@/lib/format";
import type { Category, ProductStatus, ProductWithImages } from "@/lib/types";
import {
  BTN_GHOST,
  BTN_PRIMARY,
  PRODUCT_STATUS_OPTIONS,
  PRODUCT_STATUS_TONES,
} from "./product-ui";

const PAGE_SIZE = 20;

interface ListResponse {
  products: ProductWithImages[];
  total: number;
  page: number;
  totalPages: number;
}

function thumbnailOf(p: ProductWithImages): string | null {
  const imgs = [...(p.product_images ?? [])].sort((a, b) => a.sort_order - b.sort_order);
  return imgs.find((i) => i.is_primary)?.url ?? imgs[0]?.url ?? null;
}

/** 옵션이 있으면 옵션 재고 합계, 없으면 상품 재고 */
function stockOf(p: ProductWithImages): { stock: number; hasVariants: boolean } {
  const variants = p.product_variants ?? [];
  if (variants.length > 0) {
    return { stock: variants.reduce((sum, v) => sum + v.stock, 0), hasVariants: true };
  }
  return { stock: p.stock, hasVariants: false };
}

export default function ProductsClient() {
  const router = useRouter();

  // rows === null 이면 로딩 중 (스켈레톤)
  const [rows, setRows] = useState<ProductWithImages[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loading = rows === null;
  const [categories, setCategories] = useState<Category[]>([]);

  const [q, setQ] = useState("");
  const [appliedQ, setAppliedQ] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  // 카테고리 필터 옵션
  useEffect(() => {
    fetch("/api/admin/categories")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { categories: Category[] } | null) => {
        if (data) setCategories(data.categories);
      })
      .catch(() => undefined);
  }, []);

  // 검색어 디바운스
  useEffect(() => {
    if (q === appliedQ) return;
    const t = setTimeout(() => {
      setRows(null);
      setPage(1);
      setAppliedQ(q);
    }, 400);
    return () => clearTimeout(t);
  }, [q, appliedQ]);

  // 목록 로드 — 필터/페이지 변경 시 재조회
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
        if (appliedQ) params.set("q", appliedQ);
        if (category) params.set("category", category);
        if (status) params.set("status", status);
        const res = await fetch(`/api/admin/products?${params.toString()}`);
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error ?? "상품 목록을 불러오지 못했습니다.");
        }
        const data = (await res.json()) as ListResponse;
        if (cancelled) return;
        setRows(data.products);
        setTotal(data.total);
        setTotalPages(data.totalPages);
        setError(null);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "상품 목록을 불러오지 못했습니다.");
        setRows([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [appliedQ, category, status, page]);

  /** 상태 인라인 변경 — 낙관적 반영 후 실패 시 롤백 */
  async function changeStatus(id: string, next: ProductStatus) {
    if (!rows) return;
    const prev = rows;
    setRows(rows.map((r) => (r.id === id ? { ...r, status: next } : r)));
    const res = await fetch(`/api/admin/products/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ product: { status: next } }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setRows(prev);
      setError(body?.error ?? "상태 변경에 실패했습니다.");
    }
  }

  const columns: DataTableColumn<ProductWithImages>[] = [
    {
      key: "name",
      label: "상품",
      render: (p) => {
        const thumb = thumbnailOf(p);
        return (
          <div className="flex items-center gap-3">
            <div className="relative h-11 w-11 shrink-0 overflow-hidden border border-ink-200 bg-cream-100">
              {thumb ? (
                <Image src={thumb} alt={p.name} fill sizes="44px" className="object-cover" />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-[10px] text-ink-300">
                  No img
                </span>
              )}
            </div>
            <div className="min-w-0">
              <p className="truncate font-medium text-ink-900">{p.name}</p>
              <p className="mt-0.5 truncate text-xs text-ink-400">{p.sku ?? "SKU 미지정"}</p>
            </div>
          </div>
        );
      },
    },
    {
      key: "category",
      label: "카테고리",
      width: "120px",
      hideOnMobile: true,
      render: (p) => p.categories?.name ?? <span className="text-ink-300">미분류</span>,
    },
    {
      key: "price",
      label: "판매가",
      width: "130px",
      align: "right",
      render: (p) => (
        <div className="krw">
          <span className="font-medium">{krw(p.price)}원</span>
          {p.compare_at_price != null && p.compare_at_price > p.price && (
            <span className="ml-1.5 text-xs text-ink-400 line-through">
              {krw(p.compare_at_price)}
            </span>
          )}
        </div>
      ),
    },
    {
      key: "stock",
      label: "재고",
      width: "110px",
      align: "right",
      render: (p) => {
        const { stock, hasVariants } = stockOf(p);
        const low = stock <= p.low_stock_threshold;
        return (
          <div>
            <span className={`krw font-medium ${low ? "text-signal-amber" : "text-ink-900"}`}>
              {krw(stock)}
            </span>
            {hasVariants && <span className="ml-1 text-xs text-ink-400">옵션 합계</span>}
          </div>
        );
      },
    },
    {
      key: "status",
      label: "상태",
      width: "130px",
      align: "center",
      render: (p) => (
        <div onClick={(e) => e.stopPropagation()}>
          <Select
            aria-label={`${p.name} 상태 변경`}
            value={p.status}
            onChange={(e) => void changeStatus(p.id, e.target.value as ProductStatus)}
            className={`mx-auto w-28 text-left [&_select]:py-1.5 [&_select]:text-xs ${PRODUCT_STATUS_TONES[p.status]}`}
          >
            {PRODUCT_STATUS_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </div>
      ),
    },
    {
      key: "sort_order",
      label: "노출순서",
      width: "90px",
      align: "center",
      hideOnMobile: true,
      render: (p) => <span className="krw text-ink-600">{p.sort_order}</span>,
    },
    {
      key: "created_at",
      label: "등록일",
      width: "110px",
      hideOnMobile: true,
      render: (p) => <span className="text-ink-600">{formatDate(p.created_at)}</span>,
    },
  ];

  return (
    <div>
      {/* 툴바 */}
      <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <SearchInput
          value={q}
          onChange={setQ}
          onSubmit={() => {
            setRows(null);
            setAppliedQ(q);
            setPage(1);
          }}
          placeholder="상품명 · SKU 검색"
          className="lg:max-w-72"
        />
        <div className="flex flex-wrap items-center gap-2">
          <Select
            aria-label="카테고리 필터"
            value={category}
            onChange={(e) => {
              setRows(null);
              setCategory(e.target.value);
              setPage(1);
            }}
            className="w-40"
          >
            <option value="">전체 카테고리</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          <Select
            aria-label="상태 필터"
            value={status}
            onChange={(e) => {
              setRows(null);
              setStatus(e.target.value);
              setPage(1);
            }}
            className="w-32"
          >
            <option value="">전체 상태</option>
            {PRODUCT_STATUS_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
          <Link href="/admin/products/bulk" className={`${BTN_GHOST} whitespace-nowrap`}>
            일괄 등록
          </Link>
          <Link href="/admin/products/new" className={`${BTN_PRIMARY} whitespace-nowrap`}>
            새 상품
          </Link>
        </div>
      </div>

      {error && (
        <p className="mb-4 border border-ink-200 bg-cream-100 px-4 py-3 text-sm text-signal-red">
          {error}
        </p>
      )}

      <p className="mb-3 text-xs text-ink-400">
        전체 <span className="krw font-medium text-ink-600">{krw(total)}</span>개 상품
      </p>

      <DataTable<ProductWithImages>
        columns={columns}
        rows={rows ?? []}
        loading={loading}
        emptyMessage="등록된 상품이 없습니다. 첫 상품을 등록해 보세요."
        onRowClick={(p) => router.push(`/admin/products/${p.id}`)}
        pagination={
          <Pagination
            page={page}
            totalPages={totalPages}
            onChange={(p) => {
              setRows(null);
              setPage(p);
            }}
          />
        }
      />
    </div>
  );
}
