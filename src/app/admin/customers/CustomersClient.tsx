"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import DataTable, { type DataTableColumn } from "@/components/admin/DataTable";
import Pagination from "@/components/admin/Pagination";
import SearchInput from "@/components/admin/SearchInput";
import { Select } from "@/components/admin/Field";
import { krw, formatDate, formatPhone } from "@/lib/format";

/* ============================================================
   관리자 고객 목록 — 검색 / 정렬 / 주문수 / 누적구매액 / VIP 뱃지
   ============================================================ */

interface CustomerRow {
  id: string;
  email: string | null;
  name: string | null;
  phone: string | null;
  created_at: string;
  order_count: number;
  total_spent: number;
  vip_group: string | null;
}

interface ListResponse {
  customers: CustomerRow[];
  total: number;
  totalPages: number;
}

const SORT_OPTIONS = [
  { value: "recent", label: "최근 가입순" },
  { value: "oldest", label: "오래된 가입순" },
  { value: "name", label: "이름순" },
];

export default function CustomersClient() {
  const router = useRouter();

  const [qInput, setQInput] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("recent");
  const [page, setPage] = useState(1);

  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ sort, page: String(page) });
        if (search) params.set("q", search);
        const res = await fetch(`/api/admin/customers?${params}`, { signal: controller.signal });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "고객 목록을 불러오지 못했습니다.");
        setData(json as ListResponse);
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setError(e instanceof Error ? e.message : "고객 목록을 불러오지 못했습니다.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [search, sort, page]);

  const columns: DataTableColumn<CustomerRow>[] = [
    {
      key: "name",
      label: "이름",
      width: "160px",
      render: (c) => (
        <span className="inline-flex items-center gap-2">
          <span className="font-medium">{c.name || "—"}</span>
          {c.vip_group && (
            <span className="inline-flex items-center whitespace-nowrap rounded-full border border-brass-500/50 bg-brass-300/15 px-2 py-0.5 text-[11px] font-medium text-brass-700">
              {c.vip_group}
            </span>
          )}
        </span>
      ),
    },
    { key: "email", label: "이메일" },
    {
      key: "phone",
      label: "연락처",
      width: "140px",
      render: (c) => (c.phone ? <span className="krw">{formatPhone(c.phone)}</span> : <span className="text-ink-300">—</span>),
    },
    {
      key: "created_at",
      label: "가입일",
      width: "110px",
      hideOnMobile: true,
      render: (c) => <span className="krw text-ink-600">{formatDate(c.created_at)}</span>,
    },
    {
      key: "order_count",
      label: "주문수",
      align: "right",
      width: "80px",
      render: (c) => <span className="krw">{c.order_count}</span>,
    },
    {
      key: "total_spent",
      label: "누적구매액",
      align: "right",
      width: "120px",
      render: (c) => <span className="krw">{krw(c.total_spent)}원</span>,
    },
  ];

  return (
    <div>
      {/* 툴바 */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SearchInput
          value={qInput}
          onChange={setQInput}
          onSubmit={() => {
            setPage(1);
            setSearch(qInput.trim());
          }}
          placeholder="이름 / 이메일 / 연락처 검색"
          className="sm:max-w-80"
        />
        <div className="flex items-center gap-3">
          <Select
            value={sort}
            onChange={(e) => {
              setPage(1);
              setSort(e.target.value);
            }}
            className="w-40"
            aria-label="정렬 기준"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
          {data && (
            <span className="krw whitespace-nowrap text-sm text-ink-400">
              총 {krw(data.total)}명
            </span>
          )}
        </div>
      </div>

      {error && <p className="mb-4 text-sm text-signal-red">{error}</p>}

      <DataTable<CustomerRow>
        columns={columns}
        rows={data?.customers ?? []}
        loading={loading}
        emptyMessage="조건에 맞는 고객이 없습니다."
        onRowClick={(c) => router.push(`/admin/customers/${c.id}`)}
        pagination={
          <Pagination page={page} totalPages={data?.totalPages ?? 1} onChange={setPage} />
        }
      />

      <p className="mt-4 text-xs text-ink-400">
        주문수·누적구매액은 결제완료 이후 상태(취소·환불 제외) 기준으로 집계됩니다.
      </p>
    </div>
  );
}
