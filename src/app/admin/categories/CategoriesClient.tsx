"use client";

/* ============================================================
   카테고리 관리 — 목록·순서·노출·삭제.

   이 화면이 결정하는 것은 카테고리 이름이 아니라 **고객이 홈에서 무엇을 먼저 보는가** 다.
   순서 1번이 홈의 큰 사진이 되고, 홈에는 앞에서 8개까지만 나온다(CategoryShowcase).
   전에는 그 인과를 화면이 한마디도 하지 않아서, 새 카테고리를 만들어 놓고
   "홈에 왜 안 나오지" 를 풀 수 없었다. 그래서 안내문과 뱃지로 그 사실을 드러낸다.

   순서 저장은 화살표를 누를 때마다 요청을 흘려 보내던 것을 끊고, 저장이 끝날 때까지
   조작을 잠근다. 전에는 연타하면 서로 다른 순서를 담은 요청이 동시에 떠서
   두 카테고리가 같은 순서값을 갖는 일이 생겼고, 그러면 고객 탭 순서가 새로고침마다 달라졌다.
   ============================================================ */

import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import ConfirmDialog from "@/components/admin/ConfirmDialog";
import { BTN_GHOST, BTN_PRIMARY } from "@/app/admin/products/product-ui";
import CategoryDeleteDialog from "./CategoryDeleteDialog";
import CategoryEditorModal from "./CategoryEditorModal";
import CategoryListRow from "./CategoryListRow";
import {
  HIDE_WITH_PRODUCTS_WARNING,
  HOME_TILE_LIMIT,
  ORDER_GUIDE,
  ORDER_HOW_TO,
  homePositions,
  type CategoryRow,
} from "./category-types";

export default function CategoriesClient() {
  // rows === null 이면 로딩 중 (스켈레톤)
  const [rows, setRows] = useState<CategoryRow[] | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const loading = rows === null;

  /** 편집 창 — { row: null } 이면 새 카테고리 */
  const [editing, setEditing] = useState<{ row: CategoryRow | null } | null>(null);
  const [deleting, setDeleting] = useState<CategoryRow | null>(null);
  /** 숨김으로 내리기 전 확인이 필요한 행 */
  const [hideTarget, setHideTarget] = useState<CategoryRow | null>(null);
  /** 순서 저장 중에는 모든 순서 조작을 잠근다 */
  const [busy, setBusy] = useState(false);

  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  // tick 증가로 재조회 트리거
  const [tick, setTick] = useState(0);
  const reload = () => setTick((t) => t + 1);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/categories");
        const data = (await res.json().catch(() => null)) as
          | { categories?: CategoryRow[]; error?: string }
          | null;
        if (!res.ok || !data?.categories) {
          throw new Error(data?.error ?? "카테고리 목록을 불러오지 못했습니다.");
        }
        if (cancelled) return;
        setRows(data.categories);
        setBanner(null);
      } catch (e) {
        if (cancelled) return;
        setBanner(e instanceof Error ? e.message : "카테고리 목록을 불러오지 못했습니다.");
        setRows([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tick]);

  /** 새 순서를 낙관적으로 반영하고 한 번에 저장한다 */
  async function persistOrder(next: CategoryRow[], previous: CategoryRow[]) {
    setRows(next);
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch("/api/admin/categories", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order: next.map((c) => c.id) }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(data?.error ?? "순서를 저장하지 못했습니다.");
      setBanner(null);
      setNotice("순서를 저장했습니다. 고객 화면에도 바로 반영됩니다.");
    } catch (e) {
      // 되돌린 화면이 서버와 또 어긋날 수 있으니 목록을 다시 받아 맞춘다
      setRows(previous);
      setBanner(
        `${e instanceof Error ? e.message : "순서를 저장하지 못했습니다."} 화면을 원래 순서로 되돌렸습니다.`
      );
      reload();
    } finally {
      setBusy(false);
    }
  }

  function move(index: number, dir: -1 | 1) {
    if (!rows || busy) return;
    const target = index + dir;
    if (target < 0 || target >= rows.length) return;
    const next = [...rows];
    [next[index], next[target]] = [next[target], next[index]];
    void persistOrder(next, rows);
  }

  function reorder(from: number, to: number) {
    if (!rows || busy || from === to) return;
    const next = [...rows];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    void persistOrder(next, rows);
  }

  /** 노출 토글 — 낙관적 반영 */
  async function applyActive(row: CategoryRow, active: boolean) {
    if (!rows) return;
    const previous = rows;
    setRows(rows.map((r) => (r.id === row.id ? { ...r, is_active: active } : r)));
    setNotice(null);
    const res = await fetch(`/api/admin/categories/${row.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: active }),
    });
    if (!res.ok) {
      setRows(previous);
      setBanner("노출 상태를 바꾸지 못했습니다. 잠시 후 다시 시도해 주세요.");
    }
  }

  /** 상품이 팔리고 있는 카테고리를 내릴 때는 무슨 일이 벌어지는지 먼저 알린다 */
  function requestToggle(row: CategoryRow, active: boolean) {
    if (!active && row.visible_count > 0) {
      setHideTarget(row);
      return;
    }
    void applyActive(row, active);
  }

  const list = rows ?? [];
  /* 홈 타일 자리는 목록 자리와 다르다 — 홈에는 노출 카테고리만 내려간다.
     한 곳에서 계산해 목록 행과 편집 창이 같은 값을 보게 한다. */
  const homeIndexes = homePositions(list);
  const activeCount = homeIndexes.filter((i) => i !== null).length;

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl">
          <p className="text-sm leading-relaxed text-ink-600">{ORDER_GUIDE}</p>
          <p className="mt-1 text-xs text-ink-400">{ORDER_HOW_TO}</p>
          {/* 숫자를 직접 보여 준다 — "8개까지" 라는 규칙만으로는 지금 몇 개가 넘치는지 알 수 없다 */}
          {!loading && list.length > 0 && (
            <p className="mt-1 text-xs text-ink-500">
              지금 고객에게 노출 중인 카테고리 {activeCount}개 중 홈 화면에는{" "}
              {Math.min(activeCount, HOME_TILE_LIMIT)}개가 나옵니다.
              {activeCount > HOME_TILE_LIMIT && (
                <span className="text-signal-amber">
                  {" "}
                  나머지 {activeCount - HOME_TILE_LIMIT}개는 홈에 보이지 않습니다.
                </span>
              )}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <a
            href="/"
            target="_blank"
            rel="noreferrer"
            className={`${BTN_GHOST} inline-flex items-center gap-1.5 whitespace-nowrap`}
          >
            <ExternalLink size={15} strokeWidth={1.5} />
            홈 화면 미리보기
          </a>
          <button
            type="button"
            onClick={() => setEditing({ row: null })}
            className={`${BTN_PRIMARY} whitespace-nowrap`}
          >
            새 카테고리
          </button>
        </div>
      </div>

      {banner && (
        <p className="mb-4 border border-ink-200 bg-cream-100 px-4 py-3 text-sm text-signal-red">
          {banner}
        </p>
      )}
      {notice && (
        <p className="mb-4 border border-forest-200 bg-forest-50 px-4 py-3 text-sm text-forest-700">
          {notice}
        </p>
      )}

      {loading ? (
        <ul className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <li key={i} className="h-20 animate-pulse border border-ink-200 bg-cream-100" />
          ))}
        </ul>
      ) : list.length === 0 ? (
        <div className="border border-ink-200 py-20 text-center">
          <p className="headline-serif text-lg text-ink-500">아직 카테고리가 없습니다.</p>
          <button
            type="button"
            onClick={() => setEditing({ row: null })}
            className={`${BTN_GHOST} mt-5`}
          >
            첫 카테고리 만들기
          </button>
        </div>
      ) : (
        <ul
          className={`divide-y divide-ink-100 border border-ink-200 bg-cream-50 ${
            busy ? "pointer-events-none opacity-60" : ""
          }`}
        >
          {list.map((row, i) => (
            <CategoryListRow
              key={row.id}
              row={row}
              index={i}
              homeIndex={homeIndexes[i]}
              total={list.length}
              busy={busy}
              onMove={(dir) => move(i, dir)}
              onToggle={(next) => requestToggle(row, next)}
              onEdit={() => setEditing({ row })}
              dragging={dragIndex === i}
              dropTarget={overIndex === i && dragIndex !== null && dragIndex !== i}
              dragHandlers={{
                onDragStart: () => setDragIndex(i),
                onDragOver: (e) => {
                  e.preventDefault();
                  setOverIndex(i);
                },
                onDrop: () => {
                  if (dragIndex !== null) reorder(dragIndex, i);
                  setDragIndex(null);
                  setOverIndex(null);
                },
                onDragEnd: () => {
                  setDragIndex(null);
                  setOverIndex(null);
                },
              }}
            />
          ))}
        </ul>
      )}

      {editing && (
        <CategoryEditorModal
          // 다른 행을 열 때 입력값이 남지 않도록 행마다 새로 마운트한다
          key={editing.row?.id ?? "new"}
          row={editing.row}
          siblings={list}
          onClose={() => setEditing(null)}
          onSaved={(message) => {
            setEditing(null);
            setBanner(null);
            setNotice(message);
            reload();
          }}
          onRequestDelete={(row) => {
            setEditing(null);
            setDeleting(row);
          }}
        />
      )}

      {deleting && (
        <CategoryDeleteDialog
          row={deleting}
          siblings={list}
          onClose={() => setDeleting(null)}
          onDeleted={(message) => {
            setDeleting(null);
            setNotice(message);
            reload();
          }}
        />
      )}

      <ConfirmDialog
        open={hideTarget !== null}
        onClose={() => setHideTarget(null)}
        onConfirm={async () => {
          if (hideTarget) await applyActive(hideTarget, false);
        }}
        title="카테고리를 숨길까요?"
        description={
          hideTarget
            ? `'${hideTarget.name}' 에는 고객에게 보이는 상품이 ${hideTarget.visible_count}개 있습니다.\n\n${HIDE_WITH_PRODUCTS_WARNING}`
            : ""
        }
        confirmLabel="숨기기"
      />
    </div>
  );
}
