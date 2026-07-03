"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import DataTable, { type DataTableColumn } from "@/components/admin/DataTable";
import Pagination from "@/components/admin/Pagination";
import Tabs from "@/components/admin/Tabs";
import Modal from "@/components/admin/Modal";
import { Select, Textarea, Toggle, Help } from "@/components/admin/Field";
import { formatDateTime } from "@/lib/format";
import type { Review } from "@/lib/types";

/* ---------- 타입 ---------- */

interface ReviewRow extends Omit<Review, "profiles"> {
  products: { id: string; name: string; slug: string } | null;
  profiles: { name: string | null; email: string | null } | null;
}

interface ProductOption {
  id: string;
  name: string;
}

/* ---------- 평점 표시 (이모지/별 문자 대신 도트) ---------- */

function RatingDots({ rating, className = "" }: { rating: number; className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 ${className}`}
      role="img"
      aria-label={`평점 ${rating}점`}
    >
      {Array.from({ length: 5 }).map((_, i) => (
        <span
          key={i}
          aria-hidden
          className={`h-2 w-2 rounded-full ${i < rating ? "bg-forest-600" : "bg-ink-200"}`}
        />
      ))}
      <span className="ml-1 text-xs text-ink-500 krw">{rating}.0</span>
    </span>
  );
}

/* ---------- 페이지 ---------- */

export default function ReviewsClient() {
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const [tab, setTab] = useState("all"); // all | pending | hidden
  const [productId, setProductId] = useState("");
  const [rating, setRating] = useState("");
  const [page, setPage] = useState(1);

  // 상세 모달
  const [selected, setSelected] = useState<ReviewRow | null>(null);
  const [reply, setReply] = useState("");
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const sp = new URLSearchParams({ page: String(page), status: tab });
      if (productId) sp.set("product_id", productId);
      if (rating) sp.set("rating", rating);
      const res = await fetch(`/api/admin/reviews?${sp}`, { cache: "no-store" });
      const body = await res.json();
      if (res.ok) {
        setRows(body.reviews as ReviewRow[]);
        setProducts(body.products as ProductOption[]);
        setTotal(body.total as number);
        setTotalPages(body.totalPages as number);
      }
    } finally {
      setLoading(false);
    }
  }, [page, tab, productId, rating]);

  useEffect(() => {
    void load();
  }, [load]);

  function changeFilter(update: () => void) {
    setLoading(true);
    setPage(1);
    update();
  }

  function changePage(p: number) {
    setLoading(true);
    setPage(p);
  }

  function openDetail(r: ReviewRow) {
    setSelected(r);
    setReply(r.admin_reply ?? "");
    setModalError(null);
  }

  async function patch(id: string, body: Record<string, unknown>): Promise<ReviewRow | null> {
    const res = await fetch(`/api/admin/reviews/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error ?? "저장에 실패했습니다.");
    return data.review as ReviewRow;
  }

  async function toggleHidden(r: ReviewRow, next: boolean) {
    setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, is_hidden: next } : x)));
    if (selected?.id === r.id) setSelected({ ...r, is_hidden: next });
    try {
      await patch(r.id, { is_hidden: next });
    } catch {
      setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, is_hidden: !next } : x)));
      if (selected?.id === r.id) setSelected({ ...r, is_hidden: !next });
    }
  }

  async function saveReply() {
    if (!selected) return;
    setSaving(true);
    setModalError(null);
    try {
      const updated = await patch(selected.id, { admin_reply: reply });
      if (updated) {
        setRows((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
        setSelected(updated);
      }
    } catch (e) {
      setModalError(e instanceof Error ? e.message : "저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  const columns: DataTableColumn<ReviewRow>[] = [
    {
      key: "product",
      label: "상품",
      width: "18%",
      render: (r) => (
        <span className="line-clamp-1 text-ink-900">{r.products?.name ?? "삭제된 상품"}</span>
      ),
    },
    {
      key: "author",
      label: "작성자",
      width: "12%",
      hideOnMobile: false,
      render: (r) => r.profiles?.name || r.profiles?.email || "-",
    },
    {
      key: "rating",
      label: "평점",
      width: "130px",
      render: (r) => <RatingDots rating={r.rating} />,
    },
    {
      key: "content",
      label: "내용",
      render: (r) => (
        <span className="line-clamp-2 max-w-md text-ink-700">
          {r.content}
          {r.image_urls.length > 0 && (
            <span className="ml-1.5 text-xs text-ink-400 krw">사진 {r.image_urls.length}장</span>
          )}
        </span>
      ),
    },
    {
      key: "state",
      label: "상태",
      align: "center",
      width: "110px",
      render: (r) => (
        <span className="inline-flex flex-wrap justify-center gap-1">
          {r.is_hidden && (
            <span className="bg-ink-100 px-2 py-0.5 text-[11px] text-ink-500">숨김</span>
          )}
          {r.admin_reply ? (
            <span className="bg-forest-100 px-2 py-0.5 text-[11px] text-forest-800">답글 완료</span>
          ) : (
            <span className="bg-cream-200 px-2 py-0.5 text-[11px] text-ink-600">답글 대기</span>
          )}
        </span>
      ),
    },
    {
      key: "created_at",
      label: "작성일",
      hideOnMobile: true,
      width: "150px",
      render: (r) => formatDateTime(r.created_at),
    },
  ];

  return (
    <div>
      {/* 필터 */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <Select
          aria-label="상품 필터"
          className="sm:max-w-64"
          value={productId}
          onChange={(e) => changeFilter(() => setProductId(e.target.value))}
        >
          <option value="">전체 상품</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
        <Select
          aria-label="평점 필터"
          className="sm:max-w-36"
          value={rating}
          onChange={(e) => changeFilter(() => setRating(e.target.value))}
        >
          <option value="">전체 평점</option>
          {[5, 4, 3, 2, 1].map((n) => (
            <option key={n} value={n}>
              {n}점
            </option>
          ))}
        </Select>
        <p className="text-sm text-ink-400 sm:ml-auto krw">총 {total}건</p>
      </div>

      <Tabs
        className="mb-5"
        tabs={[
          { key: "all", label: "전체" },
          { key: "pending", label: "답글 대기" },
          { key: "hidden", label: "숨김" },
        ]}
        active={tab}
        onChange={(key) => changeFilter(() => setTab(key))}
      />

      <DataTable<ReviewRow>
        columns={columns}
        rows={rows}
        loading={loading}
        emptyMessage="조건에 맞는 리뷰가 없습니다."
        onRowClick={openDetail}
        pagination={<Pagination page={page} totalPages={totalPages} onChange={changePage} />}
      />

      {/* ---------- 상세/답글 모달 ---------- */}
      <Modal
        open={selected !== null}
        onClose={() => setSelected(null)}
        title="리뷰 상세"
        size="lg"
        footer={
          <div className="flex w-full items-center justify-between gap-3">
            <Toggle
              checked={selected?.is_hidden ?? false}
              onChange={(next) => selected && toggleHidden(selected, next)}
              label={selected?.is_hidden ? "스토어에서 숨김" : "스토어에 공개"}
            />
            <button
              type="button"
              onClick={saveReply}
              disabled={saving}
              className="bg-forest-700 px-4 py-2.5 text-sm text-cream-50 transition-colors hover:bg-forest-800 disabled:opacity-50"
            >
              {saving ? "저장 중…" : "답글 저장"}
            </button>
          </div>
        }
      >
        {selected && (
          <div className="space-y-5">
            <div>
              <p className="text-sm font-semibold text-ink-900">
                {selected.products?.name ?? "삭제된 상품"}
              </p>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-400">
                <RatingDots rating={selected.rating} />
                <span>{selected.profiles?.name || selected.profiles?.email || "-"}</span>
                <span>{formatDateTime(selected.created_at)}</span>
              </div>
            </div>

            <p className="whitespace-pre-wrap border-t border-ink-100 pt-4 text-sm leading-relaxed text-ink-700">
              {selected.content}
            </p>

            {selected.image_urls.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {selected.image_urls.map((url, i) => (
                  <a
                    key={url}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="relative block h-20 w-20 overflow-hidden border border-ink-200"
                  >
                    <Image
                      src={url}
                      alt={`리뷰 사진 ${i + 1}`}
                      fill
                      sizes="80px"
                      className="object-cover"
                    />
                  </a>
                ))}
              </div>
            )}

            <div className="border-t border-ink-100 pt-4">
              <div className="mb-1.5 flex items-center justify-between">
                <label htmlFor="admin-reply" className="text-[13px] font-medium text-ink-700">
                  관리자 답글
                </label>
                <button
                  type="button"
                  onClick={() =>
                    setReply((prev) =>
                      prev.trimEnd().endsWith("다름 드림")
                        ? prev
                        : `${prev.trimEnd()}${prev.trim() ? "\n\n" : ""}다름 드림`
                    )
                  }
                  className="text-xs text-ink-500 transition-colors hover:text-forest-700"
                >
                  서명 넣기
                </button>
              </div>
              <Textarea
                id="admin-reply"
                rows={5}
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                placeholder="소중한 후기 감사합니다. …"
              />
              <Help>
                답글은 스토어 리뷰에 공개됩니다. 끝인사는 <strong>&ldquo;다름 드림&rdquo;</strong>으로
                마무리해 주세요. 내용을 비우고 저장하면 답글이 삭제됩니다.
              </Help>
              {selected.admin_replied_at && (
                <p className="mt-1 text-xs text-ink-400">
                  마지막 답글: {formatDateTime(selected.admin_replied_at)}
                </p>
              )}
              {modalError && <Help tone="error">{modalError}</Help>}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
