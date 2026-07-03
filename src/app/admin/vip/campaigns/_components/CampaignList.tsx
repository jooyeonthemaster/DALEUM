"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ExternalLink } from "lucide-react";
import DataTable from "@/components/admin/DataTable";
import Pagination from "@/components/admin/Pagination";
import { Toggle } from "@/components/admin/Field";
import { formatDate, krw } from "@/lib/format";
import {
  api,
  BTN_PRIMARY,
  campaignUrl,
  copyText,
  customerLabel,
  type CampaignRow,
} from "../../_components/vipApi";

/* ============================================================
   시크릿 캠페인 목록 — 대상/상품 수/조회수/만료/활성/링크 복사/미리보기
   ============================================================ */

const PAGE_SIZE = 20;

/** 캠페인 대상 요약 라벨 */
function targetLabel(campaign: CampaignRow): string {
  const base = campaign.vip_groups
    ? `그룹 · ${campaign.vip_groups.name}`
    : campaign.target_user_id
      ? `고객 · ${customerLabel(campaign.profiles)}`
      : "전체 공개 (링크)";
  return campaign.require_code ? `${base} + 코드 잠금` : base;
}

export default function CampaignList() {
  const router = useRouter();
  const [campaigns, setCampaigns] = useState<CampaignRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api<{ campaigns: CampaignRow[] }>("/api/admin/vip/campaigns");
      setCampaigns(data.campaigns);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "캠페인 목록을 불러오지 못했습니다.");
      setCampaigns([]);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(load, 0);
    return () => {
      clearTimeout(timer);
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
    };
  }, [load]);

  async function copyLink(campaign: CampaignRow) {
    const ok = await copyText(campaignUrl(campaign.token));
    if (!ok) return;
    setNotice(`'${campaign.title}' 링크가 복사되었습니다 — 고객에게 문자·카톡으로 전달하세요.`);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 5000);
  }

  async function toggleActive(campaign: CampaignRow, next: boolean) {
    setCampaigns((prev) =>
      prev ? prev.map((c) => (c.id === campaign.id ? { ...c, is_active: next } : c)) : prev
    );
    try {
      await api(`/api/admin/vip/campaigns/${campaign.id}`, {
        method: "PATCH",
        body: JSON.stringify({ is_active: next }),
      });
    } catch {
      setCampaigns((prev) =>
        prev ? prev.map((c) => (c.id === campaign.id ? { ...c, is_active: !next } : c)) : prev
      );
    }
  }

  const totalPages = Math.max(1, Math.ceil((campaigns?.length ?? 0) / PAGE_SIZE));
  const pageRows = useMemo(
    () => (campaigns ?? []).slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [campaigns, page]
  );

  return (
    <div>
      {/* 툴바 */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-ink-500">
          큐레이션한 상품을 전용 가격으로 담아, 링크를 아는 고객에게만 열리는 시크릿 페이지를
          만듭니다.
        </p>
        <Link href="/admin/vip/campaigns/new" className={`shrink-0 text-center ${BTN_PRIMARY}`}>
          새 캠페인
        </Link>
      </div>

      {notice && (
        <p className="mb-4 border border-forest-200 bg-forest-50 px-4 py-2.5 text-sm text-forest-800">
          {notice}
        </p>
      )}
      {error && <p className="mb-4 text-sm text-signal-red">{error}</p>}

      <DataTable<CampaignRow>
        columns={[
          {
            key: "title",
            label: "캠페인",
            render: (c) => (
              <div className="min-w-0">
                <p className="truncate font-medium text-ink-900">{c.title}</p>
                <p className="krw truncate text-xs text-ink-400">/vip/s/{c.token}</p>
              </div>
            ),
          },
          {
            key: "target",
            label: "대상",
            width: "200px",
            render: (c) => <span className="line-clamp-1 text-ink-600">{targetLabel(c)}</span>,
          },
          {
            key: "item_count",
            label: "상품",
            width: "70px",
            align: "center",
            render: (c) => <span className="krw">{krw(c.item_count)}</span>,
          },
          {
            key: "view_count",
            label: "조회수",
            width: "80px",
            align: "center",
            hideOnMobile: true,
            render: (c) => <span className="krw">{krw(c.view_count)}</span>,
          },
          {
            key: "expires_at",
            label: "만료",
            width: "110px",
            render: (c) => {
              if (!c.expires_at) return <span className="text-ink-400">없음</span>;
              const expired = new Date(c.expires_at) < new Date();
              return (
                <span className={expired ? "text-signal-red" : "text-ink-600"}>
                  {formatDate(c.expires_at)}
                </span>
              );
            },
          },
          {
            key: "is_active",
            label: "활성",
            width: "90px",
            align: "center",
            render: (c) => (
              <span onClick={(e) => e.stopPropagation()}>
                <Toggle checked={c.is_active} onChange={(next) => toggleActive(c, next)} />
              </span>
            ),
          },
          {
            key: "actions",
            label: "공유",
            width: "160px",
            align: "right",
            render: (c) => (
              <div
                className="flex items-center justify-end gap-3"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  onClick={() => copyLink(c)}
                  className="text-sm text-ink-600 transition-colors hover:text-forest-700"
                >
                  링크 복사
                </button>
                <a
                  href={`/vip/s/${c.token}`}
                  target="_blank"
                  rel="noopener"
                  className="inline-flex items-center gap-1 text-sm text-ink-600 transition-colors hover:text-forest-700"
                >
                  미리보기
                  <ExternalLink size={14} strokeWidth={1.5} />
                </a>
              </div>
            ),
          },
        ]}
        rows={pageRows}
        loading={campaigns === null}
        emptyMessage="아직 만들어진 시크릿 캠페인이 없습니다."
        onRowClick={(c) => router.push(`/admin/vip/campaigns/${c.id}`)}
        pagination={<Pagination page={page} totalPages={totalPages} onChange={setPage} />}
      />
    </div>
  );
}
