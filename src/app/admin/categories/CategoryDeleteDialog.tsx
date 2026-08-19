"use client";

/* ============================================================
   카테고리 삭제 확인.

   왜 그냥 확인창이 아니라 별도 컴포넌트인가:
   삭제하면 소속 상품은 지워지지 않고 '미분류' 가 된다(products.category_id 가
   on delete set null 이다 — 0001 스키마에서 확인). 문제는 그 다음이다. 관리자 상품
   목록에는 '미분류만 보기' 필터도, 여러 상품의 카테고리를 한꺼번에 바꾸는 수단도 없어서,
   상품 7개짜리 카테고리를 지우면 27개 목록을 넘겨 가며 하나씩 열어 다시 지정해야 한다.
   그래서 지우기 전에 "어디로 옮길지" 를 여기서 함께 받는다.
   ============================================================ */

import { useState } from "react";
import Modal from "@/components/admin/Modal";
import { Help, Select } from "@/components/admin/Field";
import { BTN_DANGER, BTN_GHOST } from "@/app/admin/products/product-ui";
import type { CategoryRow } from "./category-types";

export interface CategoryDeleteDialogProps {
  row: CategoryRow;
  siblings: CategoryRow[];
  onClose: () => void;
  /** 삭제 성공 — 화면에 띄울 안내 문구를 함께 넘긴다 */
  onDeleted: (message: string) => void;
}

const KEEP_UNCATEGORIZED = "";

export default function CategoryDeleteDialog({
  row,
  siblings,
  onClose,
  onDeleted,
}: CategoryDeleteDialogProps) {
  const [moveTo, setMoveTo] = useState(KEEP_UNCATEGORIZED);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const others = siblings.filter((s) => s.id !== row.id);
  const hasProducts = row.product_count > 0;

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      const query = moveTo ? `?moveTo=${encodeURIComponent(moveTo)}` : "";
      const res = await fetch(`/api/admin/categories/${row.id}${query}`, { method: "DELETE" });
      const data = (await res.json().catch(() => null)) as
        | { error?: string; moved?: number }
        | null;
      if (!res.ok) throw new Error(data?.error ?? "카테고리를 삭제하지 못했습니다.");

      const target = others.find((s) => s.id === moveTo);
      const moved = data?.moved ?? 0;
      onDeleted(
        target && moved > 0
          ? `'${row.name}' 을 지우고 상품 ${moved}개를 '${target.name}' 으로 옮겼습니다.`
          : hasProducts
            ? `'${row.name}' 을 지웠습니다. 소속 상품 ${row.product_count}개는 미분류로 남았습니다.`
            : `'${row.name}' 을 지웠습니다.`
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "카테고리를 삭제하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={busy ? () => undefined : onClose}
      title="카테고리 삭제"
      footer={
        <>
          <button type="button" onClick={onClose} disabled={busy} className={BTN_GHOST}>
            취소
          </button>
          <button
            type="button"
            onClick={() => void remove()}
            disabled={busy}
            className={BTN_DANGER}
          >
            {busy ? "지우는 중…" : "삭제"}
          </button>
        </>
      }
    >
      <p className="text-sm leading-relaxed text-ink-600">
        <strong className="font-medium text-ink-900">&lsquo;{row.name}&rsquo;</strong> 카테고리를
        지웁니다. 고객 화면에서 이 탭이 사라지고, 홈 화면 타일도 함께 없어집니다.
      </p>

      {hasProducts ? (
        <div className="mt-4">
          <p className="text-sm leading-relaxed text-ink-600">
            소속 상품 <span className="krw font-medium text-ink-900">{row.product_count}</span>개는
            지워지지 않습니다. 어디로 옮길지 골라 주세요.
          </p>
          <Select
            className="mt-2 max-w-xs"
            value={moveTo}
            onChange={(e) => setMoveTo(e.target.value)}
            aria-label="소속 상품을 옮길 카테고리"
          >
            <option value={KEEP_UNCATEGORIZED}>미분류로 두기</option>
            {others.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.is_active ? "" : " (숨김)"}
              </option>
            ))}
          </Select>
          {moveTo === KEEP_UNCATEGORIZED && (
            <Help tone="error">
              미분류로 두면 상품 목록에서 이 상품들만 따로 골라내기 어렵습니다. 옮길 카테고리를
              고르는 편을 권합니다.
            </Help>
          )}
        </div>
      ) : (
        <p className="mt-4 text-sm text-ink-500">이 카테고리에 속한 상품은 없습니다.</p>
      )}

      {error && <p className="mt-4 text-sm text-signal-red">{error}</p>}
    </Modal>
  );
}
