"use client";

/* ============================================================
   상품 목록 화면.

   이 화면을 다시 만든 이유:
   전에는 상품 27개를 한 건씩 열어야만 어떤 변경도 할 수 있었다. 카테고리를 옮기거나
   수다락 13개 판매가를 8% 올리는 일은 개발자가 스크립트를 돌려 주지 않으면 불가능했고,
   관리자에게 가장 중요한 구분인 공급처(자체/수다락)는 DB 에만 있고 화면엔 없었다.
   게다가 판매가 0원짜리 업소용 벌크 상품을 드롭다운 한 번으로 스토어에 노출시킬 수 있었다.

   그래서 (1) 행 선택과 일괄 작업, (2) 공급처·브랜드 표기와 필터, (3) 정렬·페이지 크기,
   (4) 상품 건전성 배지, (5) 0원 상품의 판매중 전환 차단을 넣었다.
   조회 상태는 useProductList 훅이, 화면 조각은 _list/ 아래가 맡고 여기서는 그 둘을
   엮어 "누르면 무슨 일이 일어나는지" 만 다룬다.
   ============================================================ */

import { useState } from "react";
import Pagination from "@/components/admin/Pagination";
import ConfirmDialog from "@/components/admin/ConfirmDialog";
import type { ProductStatus } from "@/lib/types";
import { BTN_GHOST } from "./product-ui";
import ProductListTable from "./_list/ProductListTable";
import ProductsToolbar from "./_list/ProductsToolbar";
import ListMetaBar from "./_list/ListMetaBar";
import BulkActionBar from "./_list/BulkActionBar";
import PriceAdjustModal from "./_list/PriceAdjustModal";
import { useProductList } from "./_list/useProductList";
import { summarizeBulkResult } from "./_list/bulk-summary";
import { buildBulkConfirm, type BulkConfirmCopy } from "./_list/bulk-confirm";
import type { BulkAction, BulkEditResult, ProductListRow } from "./_list/list-types";

interface Notice {
  tone: "ok" | "warn";
  text: string;
}

/** 확인을 기다리는 일괄 작업 — 무엇을 할지와 어떻게 물어볼지를 함께 들고 있는다 */
interface PendingBulk {
  action: BulkAction;
  copy: BulkConfirmCopy;
}

export default function ProductsClient() {
  const list = useProductList();

  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  /** 행 단위 실패 안내 — 화면 맨 위 배너 하나로는 20번째 행의 실패를 볼 수 없다 */
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [bulkBusy, setBulkBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [priceModalOpen, setPriceModalOpen] = useState(false);
  /** 가격 조정 실패 사유 — 모달을 닫지 않고 그 안에서 알린다 */
  const [priceError, setPriceError] = useState<string | null>(null);
  const [pendingActivate, setPendingActivate] = useState<ProductListRow | null>(null);
  const [pendingBulk, setPendingBulk] = useState<PendingBulk | null>(null);

  /* ---------- 행 단위 상태 변경 ---------- */

  async function applyStatus(row: ProductListRow, next: ProductStatus) {
    setRowErrors((prev) =>
      Object.fromEntries(Object.entries(prev).filter(([id]) => id !== row.id))
    );
    setBusyIds((prev) => new Set(prev).add(row.id));
    list.setRows((rs) => rs?.map((r) => (r.id === row.id ? { ...r, status: next } : r)) ?? rs);

    const fail = (message: string) => {
      // 되돌리는 것은 이 행 하나뿐이다 — 목록 전체를 되돌리면 방금 성공한 다른 행까지 사라진다
      list.setRows(
        (rs) => rs?.map((r) => (r.id === row.id ? { ...r, status: row.status } : r)) ?? rs
      );
      setRowErrors((prev) => ({ ...prev, [row.id]: message }));
    };

    try {
      const res = await fetch(`/api/admin/products/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product: { status: next } }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        // 서버가 돌려준 한국어 사유를 그대로 보여 준다 (예: 판매가 0원이라 판매중 불가)
        fail(body?.error ?? "상태를 저장하지 못했습니다. 다시 시도해 주세요.");
      }
    } catch {
      fail("연결이 끊겨 저장하지 못했습니다. 다시 시도해 주세요.");
    } finally {
      setBusyIds((prev) => {
        const nextSet = new Set(prev);
        nextSet.delete(row.id);
        return nextSet;
      });
    }
  }

  function requestStatusChange(row: ProductListRow, next: ProductStatus) {
    if (next === row.status) return;
    // 판매중으로 올리면 곧바로 고객 스토어에 뜬다 — 한 단계 확인을 받는다
    if (next === "active") {
      setPendingActivate(row);
      return;
    }
    void applyStatus(row, next);
  }

  /* ---------- 일괄 작업 ---------- */

  /**
   * @returns 서버가 요청을 받아들였으면 true. 실패했으면 false —
   *          가격 모달은 이 값을 보고 **성공했을 때만** 닫는다. 예전에는 실패해도
   *          모달을 닫아 버려서 방금 고른 대상·방식·끝자리가 전부 사라졌고,
   *          관리자는 처음부터 다시 골라야 했다.
   */
  async function runBulk(action: BulkAction, headline: string): Promise<boolean> {
    const ids = list.selectedRows.map((r) => r.id);
    if (ids.length === 0) return false;
    setBulkBusy(true);
    setNotice(null);
    const failWith = (text: string) => {
      // 가격은 모달 안에서, 나머지는 목록 위 배너로 알린다
      if (action.kind === "price") setPriceError(text);
      else setNotice({ tone: "warn", text });
    };
    try {
      const res = await fetch("/api/admin/products/bulk-edit", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, action }),
      });
      const body = (await res.json().catch(() => null)) as
        (BulkEditResult & { error?: string }) | null;
      if (!res.ok || !body) {
        failWith(body?.error ?? "일괄 변경에 실패했습니다.");
        return false;
      }
      setPriceError(null);
      setNotice({
        tone: body.failed.length > 0 ? "warn" : "ok",
        text: summarizeBulkResult(headline, body),
      });
      list.reload();
      return true;
    } catch {
      failWith("연결이 끊겨 일괄 변경을 마치지 못했습니다.");
      return false;
    } finally {
      setBulkBusy(false);
    }
  }

  /**
   * 상태·카테고리·추천은 곧바로 실행하지 않고 확인을 한 번 받는다.
   * 행 하나에는 이미 확인이 있었는데 N개를 바꾸는 쪽이 무방비였다.
   */
  function requestBulk(action: BulkAction) {
    setPendingBulk({
      action,
      copy: buildBulkConfirm(action, list.selectedRows, list.categories),
    });
  }

  const pageRowCount = list.rows?.length ?? 0;

  return (
    <div>
      <ProductsToolbar
        q={list.q}
        onQChange={list.setQ}
        onQSubmit={() => list.changeQuery(() => list.setAppliedQ(list.q))}
        category={list.category}
        onCategoryChange={(v) => list.changeQuery(() => list.setCategory(v))}
        supplier={list.supplier}
        onSupplierChange={(v) => list.changeQuery(() => list.setSupplier(v))}
        brand={list.brand}
        onBrandChange={(v) => list.changeQuery(() => list.setBrand(v))}
        status={list.status}
        onStatusChange={(v) => list.changeQuery(() => list.setStatus(v))}
        categories={list.categories}
        facets={list.facets}
        hasFilter={list.hasFilter}
        onReset={list.resetFilters}
      />

      {list.listError && (
        <p className="mb-4 border border-signal-red/40 bg-signal-red/5 px-4 py-3 text-sm text-signal-red">
          {list.listError}
        </p>
      )}

      {notice && (
        <p
          className={`mb-4 border px-4 py-3 text-sm leading-relaxed ${
            notice.tone === "ok"
              ? "border-forest-600/40 bg-forest-50 text-forest-800"
              : "border-signal-amber/50 bg-signal-amber/5 text-signal-amber"
          }`}
        >
          {notice.text}
        </p>
      )}

      {list.selectedRows.length > 0 && (
        <BulkActionBar
          count={list.selectedRows.length}
          zeroPriceCount={list.selectedRows.filter((r) => r.price <= 0).length}
          categories={list.categories}
          busy={bulkBusy}
          onStatus={(value) => requestBulk({ kind: "status", value })}
          onCategory={(value) => requestBulk({ kind: "category", value })}
          onFeatured={(value) => requestBulk({ kind: "featured", value })}
          onPriceAdjust={() => {
            setPriceError(null);
            setPriceModalOpen(true);
          }}
          onDropZeroPrice={() =>
            list.deselectIds(list.selectedRows.filter((r) => r.price <= 0).map((r) => r.id))
          }
          onClear={list.clearSelection}
        />
      )}

      <ListMetaBar
        total={list.total}
        rangeStart={list.total === 0 ? 0 : (list.page - 1) * list.pageSize + 1}
        rangeEnd={Math.min(list.total, (list.page - 1) * list.pageSize + pageRowCount)}
        hasFilter={list.hasFilter}
        pageFullySelected={pageRowCount > 0 && list.selectedRows.length === pageRowCount}
        pageRowCount={pageRowCount}
        sort={list.sort}
        dir={list.dir}
        onSortChange={(nextSort, nextDir) =>
          list.changeQuery(() => {
            list.setSort(nextSort);
            list.setDir(nextDir);
          })
        }
        pageSize={list.pageSize}
        onPageSizeChange={(size) => list.changeQuery(() => list.setPageSize(size))}
      />

      <ProductListTable
        rows={list.rows ?? []}
        loading={list.loading}
        selectedIds={list.selectedIds}
        busyIds={busyIds}
        rowErrors={rowErrors}
        sort={list.sort}
        dir={list.dir}
        onSort={list.toggleSort}
        onToggle={list.toggleSelect}
        onToggleAll={list.toggleSelectAll}
        onStatusChange={requestStatusChange}
        emptyMessage={
          list.hasFilter ? (
            <div>
              <p className="headline-serif text-lg text-ink-500">조건에 맞는 상품이 없습니다.</p>
              <button type="button" onClick={list.resetFilters} className={`${BTN_GHOST} mt-4`}>
                조건 지우고 전체 보기
              </button>
            </div>
          ) : (
            <p className="headline-serif text-lg text-ink-500">
              등록된 상품이 없습니다. 첫 상품을 등록해 보세요.
            </p>
          )
        }
      />

      <div className="mt-6">
        <Pagination
          page={list.page}
          totalPages={list.totalPages}
          onChange={(p) => list.changeQuery(() => list.setPage(p), { resetPage: false })}
        />
      </div>

      <PriceAdjustModal
        open={priceModalOpen}
        rows={list.selectedRows}
        busy={bulkBusy}
        errorText={priceError}
        onClose={() => {
          setPriceModalOpen(false);
          setPriceError(null);
        }}
        onApply={(plan) => {
          const action: BulkAction = { kind: "price", plan };
          void runBulk(
            action,
            buildBulkConfirm(action, list.selectedRows, list.categories).headline
          )
            // 성공했을 때만 닫는다 — 실패하면 고른 조건을 그대로 두고 모달 안에서 이유를 알린다
            .then((done) => {
              if (done) setPriceModalOpen(false);
            });
        }}
      />

      <ConfirmDialog
        open={pendingActivate !== null}
        onClose={() => setPendingActivate(null)}
        onConfirm={async () => {
          if (pendingActivate) await applyStatus(pendingActivate, "active");
        }}
        title="고객 스토어에 바로 노출됩니다"
        description={
          pendingActivate
            ? `'${pendingActivate.name}'을(를) 판매중으로 바꾸면 고객 스토어에 즉시 나타나고 주문을 받게 됩니다. 계속할까요?`
            : ""
        }
        confirmLabel="판매중으로 바꾸기"
      />

      {/* 일괄 상태·카테고리·추천 확인 — 드롭다운을 스치기만 해도 N개가 바뀌던 자리 */}
      <ConfirmDialog
        open={pendingBulk !== null}
        onClose={() => setPendingBulk(null)}
        onConfirm={async () => {
          if (pendingBulk) await runBulk(pendingBulk.action, pendingBulk.copy.headline);
        }}
        title={pendingBulk?.copy.title ?? ""}
        description={pendingBulk?.copy.description ?? ""}
        confirmLabel={pendingBulk?.copy.confirmLabel ?? "확인"}
        danger={pendingBulk?.action.kind === "status" && pendingBulk.action.value === "active"}
      />
    </div>
  );
}
