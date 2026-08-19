"use client";

import { useCallback, useEffect, useState } from "react";
import DataTable, { type DataTableColumn } from "@/components/admin/DataTable";
import Pagination from "@/components/admin/Pagination";
import Tabs from "@/components/admin/Tabs";
import SearchInput from "@/components/admin/SearchInput";
import { Select } from "@/components/admin/Field";
import { formatDateTime } from "@/lib/format";
import { TOGGLE_LABELS } from "@/lib/admin-labels";
import ReviewDetailModal from "./ReviewDetailModal";
import {
  authorName,
  RatingDots,
  ReplyBadge,
  VisibilityBadge,
  type ProductOption,
  type ReviewCounts,
  type ReviewRow,
} from "./review-ui";

/* ============================================================
   리뷰 관리 — 답글 대기 건수를 탭에서 바로 보이게, 목록에서 바로 숨길 수 있게

   왜 탭에 숫자를 붙였나: 예전 화면은 '전체 / 답글 대기 / 숨김' 세 글자뿐이라
   답글이 밀린 리뷰가 있는지 탭을 눌러 봐야 알 수 있었다. 업소용 문의 화면은
   이미 건수를 보여주고 있었으므로 같은 결로 맞춘다.
   ============================================================ */

const EMPTY_COUNTS: ReviewCounts = { all: 0, pending: 0, hidden: 0 };

export default function ReviewsClient() {
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [counts, setCounts] = useState<ReviewCounts>(EMPTY_COUNTS);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const [tab, setTab] = useState("all"); // all | pending | hidden
  const [productId, setProductId] = useState("");
  const [rating, setRating] = useState("");
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);

  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const sp = new URLSearchParams({ page: String(page), status: tab });
    if (productId) sp.set("product_id", productId);
    if (rating) sp.set("rating", rating);
    if (q) sp.set("q", q);
    try {
      // try/catch 블록 대신 promise 의 catch 를 쓴다 — 동기 구간에서 setState 가 일어나면
      // effect 안 연쇄 렌더로 잡히고(React 19 규칙), 실제로 lint 가 막는다.
      const res = await fetch(`/api/admin/reviews?${sp}`, { cache: "no-store" }).catch(() => null);
      if (!res) {
        setLoadError("네트워크 문제로 리뷰 목록을 불러오지 못했습니다.");
        return;
      }
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLoadError(body.error ?? "리뷰 목록을 불러오지 못했습니다.");
        return;
      }
      setLoadError(null);
      setRows(body.reviews as ReviewRow[]);
      setProducts(body.products as ProductOption[]);
      setCounts((body.counts as ReviewCounts) ?? EMPTY_COUNTS);
      setTotal(body.total as number);
      setTotalPages(body.totalPages as number);
    } finally {
      setLoading(false);
    }
  }, [page, tab, productId, rating, q]);

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

  /** 목록에서 바로 가리기 — 악성 리뷰를 보자마자 한 번에 내릴 수 있어야 한다 */
  async function toggleHidden(r: ReviewRow) {
    const next = !r.is_hidden;
    setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, is_hidden: next } : x)));
    const res = await fetch(`/api/admin/reviews/${r.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_hidden: next }),
    });
    if (!res.ok) {
      // 서버가 거절했으면 화면을 원래대로 되돌린다 — 숨긴 줄 알고 넘어가면 안 된다
      setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, is_hidden: !next } : x)));
      setLoadError("리뷰 상태를 바꾸지 못했습니다. 잠시 후 다시 시도해 주세요.");
      return;
    }
    void load();
  }

  const selected = rows.find((r) => r.id === selectedId) ?? null;

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
      render: (r) => <span className="line-clamp-1">{authorName(r)}</span>,
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
      width: "150px",
      render: (r) => (
        <span className="inline-flex flex-wrap justify-center gap-1">
          <VisibilityBadge hidden={r.is_hidden} />
          <ReplyBadge replied={Boolean(r.admin_reply)} />
        </span>
      ),
    },
    {
      key: "created_at",
      label: "작성일",
      hideOnMobile: true,
      width: "140px",
      render: (r) => <span className="krw text-ink-500">{formatDateTime(r.created_at)}</span>,
    },
    {
      key: "quick",
      label: "바로 처리",
      align: "center",
      width: "110px",
      render: (r) => (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation(); // 행 클릭(상세 열기)과 겹치지 않게
            void toggleHidden(r);
          }}
          className="border border-ink-200 px-2.5 py-1 text-xs text-ink-600 transition-colors hover:border-ink-400"
        >
          {r.is_hidden ? `${TOGGLE_LABELS.on}로 바꾸기` : `${TOGGLE_LABELS.off} 처리`}
        </button>
      ),
    },
  ];

  const emptyMessage = q
    ? "검색어와 일치하는 리뷰가 없습니다."
    : tab === "pending"
      ? "답글을 기다리는 리뷰가 없습니다."
      : tab === "hidden"
        ? "숨김 처리한 리뷰가 없습니다."
        : "아직 등록된 리뷰가 없습니다.";

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
        <SearchInput
          value={qInput}
          onChange={setQInput}
          onSubmit={() => changeFilter(() => setQ(qInput.trim()))}
          placeholder="리뷰 내용 검색"
          className="sm:max-w-64"
        />
        <p className="text-sm text-ink-400 sm:ml-auto krw">총 {total}건</p>
      </div>

      <Tabs
        className="mb-5"
        tabs={[
          { key: "all", label: "전체", count: counts.all },
          { key: "pending", label: "답글 대기", count: counts.pending },
          { key: "hidden", label: "숨김", count: counts.hidden },
        ]}
        active={tab}
        onChange={(key) => changeFilter(() => setTab(key))}
      />

      {loadError && (
        <p
          role="alert"
          className="mb-4 border border-signal-red/40 bg-signal-red/5 px-4 py-3 text-sm text-signal-red"
        >
          {loadError}
        </p>
      )}

      <DataTable<ReviewRow>
        columns={columns}
        rows={rows}
        loading={loading}
        emptyMessage={emptyMessage}
        onRowClick={(r) => setSelectedId(r.id)}
        pagination={<Pagination page={page} totalPages={totalPages} onChange={changePage} />}
      />

      <p className="mt-4 text-xs leading-relaxed text-ink-400">
        리뷰는 고객이 올리는 즉시 스토어에 공개됩니다. 부적절한 리뷰는 [{TOGGLE_LABELS.off} 처리]로
        바로 가릴 수 있고, 개인정보나 비방이 담겨 완전히 지워야 하면 리뷰를 열어 영구 삭제하세요.
      </p>

      {selected && (
        <ReviewDetailModal
          key={selected.id}
          review={selected}
          onClose={() => setSelectedId(null)}
          onUpdated={(next) => {
            setRows((prev) => prev.map((x) => (x.id === next.id ? next : x)));
            void load();
          }}
          onDeleted={() => {
            setSelectedId(null);
            void load();
          }}
        />
      )}
    </div>
  );
}
