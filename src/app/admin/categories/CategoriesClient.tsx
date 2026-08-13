"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { ChevronDown, ChevronUp } from "lucide-react";
import Modal from "@/components/admin/Modal";
import ConfirmDialog from "@/components/admin/ConfirmDialog";
import ImageUploader from "@/components/admin/ImageUploader";
import { FieldRow, Input, Textarea, Toggle } from "@/components/admin/Field";
import { krw, slugify } from "@/lib/format";
import {
  BTN_GHOST,
  BTN_PRIMARY,
} from "@/app/admin/products/product-ui";

interface CategoryRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  image_url: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  product_count: number;
}

interface EditorState {
  id: string | null; // null이면 신규
  name: string;
  slug: string;
  description: string;
  image_url: string | null;
  is_active: boolean;
  slugTouched: boolean;
}

const EMPTY_EDITOR: EditorState = {
  id: null,
  name: "",
  slug: "",
  description: "",
  image_url: null,
  is_active: true,
  slugTouched: false,
};

// 한글 slug 는 라우트에서 퍼센트 인코딩된 채 조회돼 상세페이지가 404 가 된다 — ASCII 만 허용한다.
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export default function CategoriesClient() {
  // rows === null 이면 로딩 중 (스켈레톤)
  const [rows, setRows] = useState<CategoryRow[] | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const loading = rows === null;

  const [editor, setEditor] = useState<EditorState | null>(null);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<CategoryRow | null>(null);

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

  /** 위/아래 이동 — 낙관적 반영 후 전체 순서 저장 */
  async function move(index: number, dir: -1 | 1) {
    if (!rows) return;
    const target = index + dir;
    if (target < 0 || target >= rows.length) return;
    const next = [...rows];
    [next[index], next[target]] = [next[target], next[index]];
    const prev = rows;
    setRows(next);
    const res = await fetch("/api/admin/categories", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order: next.map((c) => c.id) }),
    });
    if (!res.ok) {
      setRows(prev);
      setBanner("순서 변경에 실패했습니다.");
    }
  }

  /** 노출 토글 — 낙관적 반영 */
  async function toggleActive(row: CategoryRow, active: boolean) {
    if (!rows) return;
    const prev = rows;
    setRows(rows.map((r) => (r.id === row.id ? { ...r, is_active: active } : r)));
    const res = await fetch(`/api/admin/categories/${row.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: active }),
    });
    if (!res.ok) {
      setRows(prev);
      setBanner("노출 상태 변경에 실패했습니다.");
    }
  }

  function openNew() {
    setEditorError(null);
    setEditor({ ...EMPTY_EDITOR });
  }

  function openEdit(row: CategoryRow) {
    setEditorError(null);
    setEditor({
      id: row.id,
      name: row.name,
      slug: row.slug,
      description: row.description ?? "",
      image_url: row.image_url,
      is_active: row.is_active,
      slugTouched: true,
    });
  }

  async function saveEditor() {
    if (!editor) return;
    const name = editor.name.trim();
    const slug = editor.slug.trim();
    if (!name) {
      setEditorError("카테고리 이름을 입력해 주세요.");
      return;
    }
    if (!slug || !SLUG_RE.test(slug)) {
      setEditorError("URL 슬러그는 영문 소문자·숫자·한글·하이픈만 사용할 수 있습니다.");
      return;
    }
    setSaving(true);
    setEditorError(null);
    try {
      const res = await fetch(
        editor.id ? `/api/admin/categories/${editor.id}` : "/api/admin/categories",
        {
          method: editor.id ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            slug,
            description: editor.description.trim() || null,
            image_url: editor.image_url,
            is_active: editor.is_active,
          }),
        }
      );
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(data?.error ?? "저장에 실패했습니다.");
      setEditor(null);
      reload();
    } catch (e) {
      setEditorError(e instanceof Error ? e.message : "저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  async function doDelete() {
    if (!deleting) return;
    const res = await fetch(`/api/admin/categories/${deleting.id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      setBanner(data?.error ?? "카테고리 삭제에 실패했습니다.");
      return;
    }
    reload();
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-3">
        <p className="text-sm text-ink-600">
          위/아래 버튼으로 스토어에 표시되는 순서를 조정할 수 있습니다.
        </p>
        <button type="button" onClick={openNew} className={`${BTN_PRIMARY} whitespace-nowrap`}>
          새 카테고리
        </button>
      </div>

      {banner && (
        <p className="mb-4 border border-ink-200 bg-cream-100 px-4 py-3 text-sm text-signal-red">
          {banner}
        </p>
      )}

      {loading ? (
        <ul className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <li key={i} className="h-20 animate-pulse border border-ink-200 bg-cream-100" />
          ))}
        </ul>
      ) : (rows ?? []).length === 0 ? (
        <div className="border border-ink-200 py-20 text-center">
          <p className="headline-serif text-lg text-ink-500">아직 카테고리가 없습니다.</p>
          <button type="button" onClick={openNew} className={`${BTN_GHOST} mt-5`}>
            첫 카테고리 만들기
          </button>
        </div>
      ) : (
        <ul className="divide-y divide-ink-100 border border-ink-200 bg-cream-50">
          {(rows ?? []).map((row, i) => (
            <li key={row.id} className="flex items-center gap-3 px-4 py-3.5 sm:gap-4">
              {/* 순서 조절 */}
              <div className="flex flex-col">
                <button
                  type="button"
                  onClick={() => void move(i, -1)}
                  disabled={i === 0}
                  aria-label={`${row.name} 위로 이동`}
                  className="p-1 text-ink-400 transition-colors hover:text-forest-700 disabled:opacity-25"
                >
                  <ChevronUp size={16} strokeWidth={1.5} />
                </button>
                <button
                  type="button"
                  onClick={() => void move(i, 1)}
                  disabled={i === (rows ?? []).length - 1}
                  aria-label={`${row.name} 아래로 이동`}
                  className="p-1 text-ink-400 transition-colors hover:text-forest-700 disabled:opacity-25"
                >
                  <ChevronDown size={16} strokeWidth={1.5} />
                </button>
              </div>

              {/* 이미지 */}
              <div className="relative hidden h-12 w-12 shrink-0 overflow-hidden border border-ink-200 bg-cream-100 sm:block">
                {row.image_url ? (
                  <Image
                    src={row.image_url}
                    alt={row.name}
                    fill
                    sizes="48px"
                    className="object-cover"
                  />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-[10px] text-ink-300">
                    No img
                  </span>
                )}
              </div>

              {/* 이름/slug/설명 */}
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <p className="truncate font-medium text-ink-900">{row.name}</p>
                  <span className="truncate text-xs text-ink-400">/{row.slug}</span>
                </div>
                {row.description && (
                  <p className="mt-0.5 truncate text-xs text-ink-500">{row.description}</p>
                )}
              </div>

              {/* 상품 수 */}
              <p className="hidden shrink-0 text-sm text-ink-600 sm:block">
                상품 <span className="krw font-medium">{krw(row.product_count)}</span>개
              </p>

              {/* 노출 토글 */}
              <Toggle
                checked={row.is_active}
                onChange={(v) => void toggleActive(row, v)}
                label={row.is_active ? "노출" : "숨김"}
                className="shrink-0 [&>span+span]:hidden sm:[&>span+span]:inline"
              />

              <button
                type="button"
                onClick={() => openEdit(row)}
                className="shrink-0 border border-ink-200 px-3 py-2 text-xs text-ink-600 transition-colors hover:bg-cream-100"
              >
                수정
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* 추가/수정 모달 */}
      <Modal
        open={editor !== null}
        onClose={() => (saving ? undefined : setEditor(null))}
        title={editor?.id ? "카테고리 수정" : "새 카테고리"}
        footer={
          <>
            {editor?.id && (
              <button
                type="button"
                onClick={() => {
                  const row = (rows ?? []).find((r) => r.id === editor.id);
                  if (row) {
                    setEditor(null);
                    setDeleting(row);
                  }
                }}
                disabled={saving}
                className="mr-auto text-sm text-ink-400 transition-colors hover:text-signal-red disabled:opacity-50"
              >
                삭제
              </button>
            )}
            <button
              type="button"
              onClick={() => setEditor(null)}
              disabled={saving}
              className={BTN_GHOST}
            >
              취소
            </button>
            <button
              type="button"
              onClick={() => void saveEditor()}
              disabled={saving}
              className={BTN_PRIMARY}
            >
              {saving ? "저장 중…" : "저장"}
            </button>
          </>
        }
      >
        {editor && (
          <div className="divide-y divide-ink-100">
            <FieldRow label="이름" required htmlFor="c-name">
              <Input
                id="c-name"
                value={editor.name}
                onChange={(e) =>
                  setEditor({
                    ...editor,
                    name: e.target.value,
                    ...(editor.id === null && !editor.slugTouched
                      ? { slug: slugify(e.target.value) }
                      : {}),
                  })
                }
                placeholder="예: 곤약면"
              />
            </FieldRow>
            <FieldRow label="URL 슬러그" required htmlFor="c-slug">
              <Input
                id="c-slug"
                value={editor.slug}
                onChange={(e) => setEditor({ ...editor, slug: e.target.value, slugTouched: true })}
                placeholder="konjac-noodle"
              />
            </FieldRow>
            <FieldRow label="설명" htmlFor="c-desc">
              <Textarea
                id="c-desc"
                rows={3}
                value={editor.description}
                onChange={(e) => setEditor({ ...editor, description: e.target.value })}
                placeholder="카테고리 페이지 상단에 표시되는 소개 문구"
              />
            </FieldRow>
            <FieldRow label="대표 이미지">
              <ImageUploader
                value={editor.image_url ? [{ url: editor.image_url }] : []}
                onChange={(next) => setEditor({ ...editor, image_url: next[0]?.url ?? null })}
                bucket="products"
                prefix="categories"
                multiple={false}
              />
            </FieldRow>
            <FieldRow label="노출">
              <Toggle
                checked={editor.is_active}
                onChange={(v) => setEditor({ ...editor, is_active: v })}
                label="스토어에 노출"
              />
            </FieldRow>
            {editorError && <p className="pt-3 text-sm text-signal-red">{editorError}</p>}
          </div>
        )}
      </Modal>

      {/* 삭제 확인 */}
      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={doDelete}
        title="카테고리 삭제"
        description={
          deleting
            ? `'${deleting.name}' 카테고리를 삭제하시겠습니까?\n소속 상품 ${krw(deleting.product_count)}개는 삭제되지 않고 미분류로 변경됩니다.`
            : ""
        }
        confirmLabel="삭제"
        danger
      />
    </div>
  );
}
