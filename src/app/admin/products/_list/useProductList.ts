"use client";

/* ============================================================
   목록 조회 + 행 선택 상태를 한 곳에 모은 훅.

   검색어·카테고리·공급처·브랜드·상태·정렬·페이지·페이지 크기가 모두 목록 재조회를
   부르는 값이라, 화면 컴포넌트에 흩어 두면 "필터는 바꿨는데 선택은 안 지워졌다" 같은
   빠뜨림이 생긴다. 조건을 바꾸는 통로를 changeQuery() 하나로 좁히고 선택까지 여기서
   들고 있으면 그 실수가 구조적으로 막힌다 — 조건이 바뀌면 목록이 통째로 달라지므로
   화면에 없는 상품이 선택된 채 남아 조용히 함께 바뀌는 일이 없어야 한다.
   ============================================================ */

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Category } from "@/lib/types";
import type { ListFacets, ListResponse, ProductListRow, SortDir, SortKey } from "./list-types";

export function useProductList() {
  const [rows, setRows] = useState<ProductListRow[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [facets, setFacets] = useState<ListFacets>({ suppliers: [], brands: [] });
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [q, setQ] = useState("");
  const [appliedQ, setAppliedQ] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const [supplier, setSupplier] = useState("");
  const [brand, setBrand] = useState("");
  const [sort, setSort] = useState<SortKey>("sort_order");
  const [dir, setDir] = useState<SortDir>("asc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  /** 일괄 작업 뒤 같은 조건 그대로 다시 불러오기 위한 방아쇠 */
  const [reloadKey, setReloadKey] = useState(0);

  // 카테고리 필터 옵션
  useEffect(() => {
    fetch("/api/admin/categories")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { categories: Category[] } | null) => {
        if (data) setCategories(data.categories);
      })
      .catch(() => undefined);
  }, []);

  // 검색어 디바운스 — 한 글자마다 조회하면 목록이 계속 깜빡인다
  useEffect(() => {
    if (q === appliedQ) return;
    const t = setTimeout(() => {
      setRows(null);
      setSelectedIds(new Set());
      setPage(1);
      setAppliedQ(q);
    }, 400);
    return () => clearTimeout(t);
  }, [q, appliedQ]);

  // 목록 로드
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const params = new URLSearchParams({
          page: String(page),
          limit: String(pageSize),
          sort,
          dir,
        });
        if (appliedQ) params.set("q", appliedQ);
        if (category) params.set("category", category);
        if (status) params.set("status", status);
        if (supplier) params.set("supplier", supplier);
        if (brand) params.set("brand", brand);
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
        setFacets(data.facets);
        setListError(null);
      } catch (e) {
        if (cancelled) return;
        setListError(e instanceof Error ? e.message : "상품 목록을 불러오지 못했습니다.");
        setRows([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [appliedQ, category, status, supplier, brand, sort, dir, page, pageSize, reloadKey]);

  /** 조건을 바꾸는 단 하나의 통로 — 선택 비우기가 여기 묶여 있다 */
  const changeQuery = useCallback(
    (apply: () => void, { resetPage = true }: { resetPage?: boolean } = {}) => {
      setRows(null);
      setSelectedIds(new Set());
      if (resetPage) setPage(1);
      apply();
    },
    []
  );

  const resetFilters = useCallback(() => {
    changeQuery(() => {
      setQ("");
      setAppliedQ("");
      setCategory("");
      setStatus("");
      setSupplier("");
      setBrand("");
    });
  }, [changeQuery]);

  const toggleSort = useCallback(
    (key: SortKey) => {
      changeQuery(() => {
        if (sort === key) {
          setDir(dir === "asc" ? "desc" : "asc");
          return;
        }
        setSort(key);
        // 이름·진열 순서는 작은 값부터, 나머지는 비싼 것·최근 것부터 보는 편이 훨씬 자주 쓰인다
        setDir(key === "name" || key === "sort_order" ? "asc" : "desc");
      });
    },
    [changeQuery, sort, dir]
  );

  /** 같은 조건으로 다시 불러온다 (일괄 작업 직후) */
  const reload = useCallback(() => {
    setRows(null);
    setSelectedIds(new Set());
    setReloadKey((k) => k + 1);
  }, []);

  /** 선택은 지금 보고 있는 페이지 안에서만 유효하다 */
  const selectedRows = useMemo(
    () => (rows ?? []).filter((r) => selectedIds.has(r.id)),
    [rows, selectedIds]
  );

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(
    (checked: boolean) => {
      setSelectedIds(checked ? new Set((rows ?? []).map((r) => r.id)) : new Set());
    },
    [rows]
  );

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  /**
   * 고른 것 중 일부만 빼기.
   *
   * 판매가가 없는 상품 때문에 일괄 '판매중' 이 통째로 막히던 자리를 풀어 주려면
   * "걸림돌만 빼고 그대로 실행" 이 한 번에 돼야 한다. toggleSelect 를 여러 번 부르면
   * 되지만, 무엇을 몇 번 껐는지 화면이 추적해야 해서 실수가 난다.
   */
  const deselectIds = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) next.delete(id);
      return next;
    });
  }, []);

  return {
    rows,
    setRows,
    loading: rows === null,
    listError,
    categories,
    facets,
    total,
    totalPages,
    hasFilter: Boolean(appliedQ || category || status || supplier || brand),
    q,
    setQ,
    setAppliedQ,
    category,
    setCategory,
    status,
    setStatus,
    supplier,
    setSupplier,
    brand,
    setBrand,
    sort,
    setSort,
    dir,
    setDir,
    page,
    setPage,
    pageSize,
    setPageSize,
    changeQuery,
    resetFilters,
    toggleSort,
    reload,
    selectedIds,
    selectedRows,
    toggleSelect,
    toggleSelectAll,
    deselectIds,
    clearSelection,
  };
}
