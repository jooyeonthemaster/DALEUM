"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ExternalLink } from "lucide-react";
import DataTable from "@/components/admin/DataTable";
import Pagination from "@/components/admin/Pagination";
import { Toggle } from "@/components/admin/Field";
import { formatDate } from "@/lib/format";
import {
  api,
  BTN_PRIMARY,
  campaignUrl,
  copyText,
  customerLabel,
  type CampaignRow,
} from "../../_components/vipApi";

/* ============================================================
   시크릿 캠페인 목록.

   무엇이 문제였나:
   캠페인 제목 바로 아래에 '/vip/s/nBxo_uu7fzGp' 같은 난수 주소가 부제처럼
   찍혀 있었다. 대표·마케터는 이게 캠페인 이름의 일부인지 오류인지 판단할 수
   없었다. 관리자에게 필요한 것은 주소 원문이 아니라 '무슨 캠페인인지'다.
   그래서 그 자리에 사람이 읽는 요약(상품 수·평균 할인율·조회수)을 넣었다.
   주소는 캠페인을 열면 나오는 공유 카드에서만 다룬다.
   ============================================================ */

const PAGE_SIZE = 20;

/** 누가 볼 수 있는지 한 줄로 */
function targetLabel(campaign: CampaignRow): string {
  const base = campaign.vip_groups
    ? `그룹 · ${campaign.vip_groups.name}`
    : campaign.target_user_id
      ? `고객 · ${customerLabel(campaign.profiles)}`
      : "링크를 받은 사람 누구나";
  return campaign.require_code ? `${base} · 암호 필요` : base;
}

/** 제목 아래 붙는 요약 — 담긴 상품 수와 평균 할인율 */
function summaryLabel(campaign: CampaignRow): string {
  const parts = [`상품 ${campaign.item_count}개`];
  if (campaign.avg_discount_rate != null) parts.push(`평균 ${campaign.avg_discount_rate}% 할인`);
  parts.push(`열어 본 횟수 ${campaign.view_count}`);
  return parts.join(" · ");
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
    setNotice(
      `'${campaign.title}' 링크가 복사되었습니다. 문자·카카오톡에 붙여넣어 고객에게 보내세요.`
    );
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
        <p className="text-sm leading-relaxed text-ink-500">
          고른 상품을 특별한 가격으로 담아, 링크를 받은 고객에게만 열리는 페이지를 만듭니다.
          링크는 캠페인을 열면 복사할 수 있습니다.
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
                <p className="truncate text-xs text-ink-400">{summaryLabel(c)}</p>
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
            key: "expires_at",
            label: "만료",
            width: "110px",
            render: (c) => {
              if (!c.expires_at) return <span className="text-ink-400">계속 열림</span>;
              const expired = new Date(c.expires_at) < new Date();
              return (
                <span className={expired ? "text-signal-red" : "text-ink-600"}>
                  {formatDate(c.expires_at)}
                  {expired && " 종료"}
                </span>
              );
            },
          },
          {
            key: "is_active",
            label: "열림",
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
            // 190px 미만이면 '링크 복사'가 두 줄로 접혀 버튼처럼 보이지 않는다
            width: "190px",
            align: "right",
            render: (c) => (
              <div
                className="flex items-center justify-end gap-3"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  onClick={() => copyLink(c)}
                  className="whitespace-nowrap text-sm text-forest-700 transition-colors hover:text-forest-800"
                >
                  링크 복사
                </button>
                <a
                  href={`/vip/s/${c.token}`}
                  target="_blank"
                  rel="noopener"
                  className="inline-flex items-center gap-1 whitespace-nowrap text-sm text-ink-600 transition-colors hover:text-forest-700"
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
        emptyMessage="아직 만든 캠페인이 없습니다. ‘새 캠페인’으로 첫 캠페인을 만들어 보세요."
        onRowClick={(c) => router.push(`/admin/vip/campaigns/${c.id}`)}
        pagination={<Pagination page={page} totalPages={totalPages} onChange={setPage} />}
      />
    </div>
  );
}
