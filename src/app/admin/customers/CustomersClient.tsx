"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import DataTable, { type DataTableColumn } from "@/components/admin/DataTable";
import Pagination from "@/components/admin/Pagination";
import { formatDate, formatPhone } from "@/lib/format";
import { won } from "@/lib/admin-labels";
import CustomerFilters from "./CustomerFilters";
import {
  customerQueryParams,
  DEFAULT_CUSTOMER_QUERY,
  hasCustomerFilter,
  type CustomerListQuery,
} from "./customer-query";

/* ============================================================
   관리자 고객 목록 — 검색 / 정렬 / VIP·마케팅 조건 / 명단 내려받기

   여기서 풀어야 했던 문제: 우수고객을 찾을 방법이 없었다.
   정렬은 가입일·이름뿐이라 누적구매액이 큰 손님을 찾으려면 전체를 눈으로 훑어야 했고,
   뽑은 명단을 파일로 받을 수단도 없어 결국 개발자에게 DB 조회를 부탁하게 됐다.
   ============================================================ */

interface CustomerRow {
  id: string;
  email: string | null;
  name: string | null;
  phone: string | null;
  created_at: string;
  marketing_opt_in: boolean;
  order_count: number;
  total_spent: number;
  vip_group: string | null;
}

interface ListResponse {
  customers: CustomerRow[];
  total: number;
  totalPages: number;
  truncated: boolean;
}

export default function CustomersClient() {
  const router = useRouter();

  const [qInput, setQInput] = useState("");
  const [query, setQuery] = useState<CustomerListQuery>(DEFAULT_CUSTOMER_QUERY);
  const [page, setPage] = useState(1);

  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const params = customerQueryParams(query);
        params.set("page", String(page));
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
  }, [query, page]);

  function changeQuery(next: Partial<CustomerListQuery>) {
    setPage(1);
    setQuery((prev) => ({ ...prev, ...next }));
  }

  /** 지금 화면에 걸린 조건 그대로 파일을 받는다 — 화면과 명단이 어긋나면 안 된다 */
  async function exportList() {
    if (exporting) return;
    setExporting(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/customers/export?${customerQueryParams(query)}`);
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? "명단을 만들지 못했습니다.");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `다름-고객명단-${formatDate(new Date()).replace(/\./g, "")}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "명단을 만들지 못했습니다.");
    } finally {
      setExporting(false);
    }
  }

  const columns: DataTableColumn<CustomerRow>[] = [
    {
      key: "name",
      label: "이름",
      width: "170px",
      render: (c) => (
        <span className="inline-flex items-center gap-2">
          <span className="font-medium">{c.name || "이름 미등록"}</span>
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
      render: (c) =>
        c.phone ? (
          <span className="krw">{formatPhone(c.phone)}</span>
        ) : (
          <span className="text-ink-300">—</span>
        ),
    },
    {
      key: "created_at",
      label: "가입일",
      width: "110px",
      hideOnMobile: true,
      render: (c) => <span className="krw text-ink-600">{formatDate(c.created_at)}</span>,
    },
    {
      key: "marketing_opt_in",
      label: "마케팅 수신",
      width: "110px",
      align: "center",
      hideOnMobile: true,
      render: (c) =>
        c.marketing_opt_in ? (
          <span className="bg-forest-100 px-2 py-0.5 text-[11px] text-forest-800">동의</span>
        ) : (
          <span className="text-[11px] text-ink-400">미동의</span>
        ),
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
      render: (c) => <span className="krw">{won(c.total_spent)}</span>,
    },
  ];

  return (
    <div>
      <CustomerFilters
        query={query}
        onChange={changeQuery}
        searchInput={qInput}
        onSearchInput={setQInput}
        onSearchSubmit={() => changeQuery({ search: qInput.trim() })}
        onExport={exportList}
        exporting={exporting}
        totalLabel={data ? `총 ${data.total.toLocaleString("ko-KR")}명` : ""}
      />

      {error && (
        <p
          role="alert"
          className="mb-4 border border-signal-red/40 bg-signal-red/5 px-4 py-3 text-sm text-signal-red"
        >
          {error}
        </p>
      )}

      <DataTable<CustomerRow>
        columns={columns}
        rows={data?.customers ?? []}
        loading={loading}
        emptyMessage={
          hasCustomerFilter(query)
            ? "조건에 맞는 고객이 없습니다. 조건을 줄여 다시 찾아보세요."
            : "아직 가입한 고객이 없습니다."
        }
        onRowClick={(c) => router.push(`/admin/customers/${c.id}`)}
        pagination={
          <Pagination page={page} totalPages={data?.totalPages ?? 1} onChange={setPage} />
        }
      />

      <p className="mt-4 text-xs leading-relaxed text-ink-400">
        주문수·누적구매액은 결제완료 이후 상태(취소·환불 제외) 기준으로 집계됩니다.
        [명단 내려받기]는 지금 걸어 둔 조건 그대로 이름·연락처·누적구매액·마케팅 수신 동의 여부를
        파일로 저장합니다.
      </p>
      {data?.truncated && (
        <p className="mt-2 text-xs text-signal-red">
          고객이 매우 많아 일부만 집계했습니다. 검색이나 조건을 좁혀서 확인해 주세요.
        </p>
      )}
    </div>
  );
}
