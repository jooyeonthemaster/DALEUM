"use client";

import { useCallback, useEffect, useState } from "react";
import Modal from "@/components/admin/Modal";
import { Help } from "@/components/admin/Field";
import { formatPhone } from "@/lib/format";
import { ORDER_TABS, type DateRangeValue } from "./orders-list";
import type { RecipientInfo } from "@/lib/types";

/* ============================================================
   엑셀 내려받기

   예전 문제:
   ① 화면의 탭과 무관하게 항상 결제완료+준비중만 뽑았다. '배송중' 탭을 보며 눌러도
      전혀 다른 주문이 담긴 파일이 떨어져 "엑셀이 이상하다" 는 말만 남았다.
   ② 1,000건이 넘으면 말없이 잘려, 성수기에는 초과분 고객이 통째로 발송 누락됐다.
   ③ 상품이 둘 이상이면 '곤약밥 외 1건 / 5' 로 뭉개져 창고에서 무엇을 담을지 알 수 없었다.
   ④ 택배사에서 회신한 운송장 파일을 그대로 다시 올릴 수 없었다(운송장 칸 자체가 없었다).

   그래서 대상 상태를 사람이 고르게 하고, 건수를 미리 보여주고, 품목을 전부 펼치고,
   맨 앞에 주문번호 · 택배사 · 운송장번호 세 칸을 둬 그대로 되올릴 수 있게 만든다.
   ============================================================ */

interface ExportRow {
  order_no: string;
  recipient: RecipientInfo;
  order_items: { name_snapshot: string; option_snapshot: string | null; qty: number }[];
}

interface Props {
  open: boolean;
  tab: string;
  search: string;
  range: DateRangeValue;
  onClose: () => void;
}

/** 기본 대상 — 지금까지의 동작(발송해야 할 주문) */
const SHIPPING_TARGET = "__shipping__";

function targetLabel(target: string): string {
  if (target === SHIPPING_TARGET) return "발송할 주문 (결제완료 · 준비중)";
  return ORDER_TABS.find((t) => t.key === target)?.label ?? "전체";
}

/** "곤약밥 200g(매운맛)×2, 곤약면×3" — 창고가 무엇을 몇 개 담을지 알 수 있어야 한다 */
function describeItems(items: ExportRow["order_items"]): string {
  return (items ?? [])
    .map(
      (i) => `${i.name_snapshot}${i.option_snapshot ? `(${i.option_snapshot})` : ""}×${i.qty}`
    )
    .join(", ");
}

export default function ExportDialog({ open, tab, search, range, onClose }: Props) {
  const [target, setTarget] = useState(SHIPPING_TARGET);
  const [count, setCount] = useState<number | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [counting, setCounting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const params = useCallback(
    (forTarget: string) => {
      const sp = new URLSearchParams();
      if (forTarget !== SHIPPING_TARGET) sp.set("tab", forTarget);
      if (search) sp.set("q", search);
      if (range.from) sp.set("from", range.from);
      if (range.to) sp.set("to", range.to);
      return sp;
    },
    [search, range.from, range.to]
  );

  // 대상이 바뀔 때마다 건수를 먼저 보여준다 — 무엇이 담기는지 모른 채 받게 하지 않는다
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    (async () => {
      setCounting(true);
      setError(null);
      try {
        const res = await fetch(`/api/admin/orders/export?${params(target)}`, {
          signal: controller.signal,
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "대상 주문을 세지 못했습니다.");
        setCount(json.total ?? 0);
        setTruncated(Boolean(json.truncated));
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setError(e instanceof Error ? e.message : "대상 주문을 세지 못했습니다.");
        setCount(null);
      } finally {
        if (!controller.signal.aborted) setCounting(false);
      }
    })();
    return () => controller.abort();
  }, [open, target, params]);

  async function download() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/orders/export?${params(target)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "발송 대상 조회에 실패했습니다.");

      const rows: ExportRow[] = json.rows ?? [];
      if (rows.length === 0) {
        setError("이 조건에 내보낼 주문이 없습니다. 대상이나 기간을 바꿔 보세요.");
        return;
      }

      const XLSX = await import("xlsx");
      const header = [
        "주문번호",
        "택배사",
        "운송장번호",
        "받는분성명",
        "받는분전화번호",
        "받는분우편번호",
        "받는분주소",
        "배송메세지",
        "내품명",
        "수량",
      ];
      const aoa = rows.map((r) => {
        const rec = r.recipient ?? ({} as RecipientInfo);
        const items = r.order_items ?? [];
        return [
          r.order_no,
          "",
          "",
          rec.name ?? "",
          formatPhone(rec.phone ?? ""),
          rec.postcode ?? "",
          [rec.address1, rec.address2].filter(Boolean).join(" "),
          rec.memo ?? "",
          describeItems(items),
          items.reduce((sum, i) => sum + i.qty, 0),
        ];
      });

      const ws = XLSX.utils.aoa_to_sheet([header, ...aoa]);
      ws["!cols"] = [
        { wch: 18 },
        { wch: 12 },
        { wch: 16 },
        { wch: 10 },
        { wch: 14 },
        { wch: 10 },
        { wch: 44 },
        { wch: 24 },
        { wch: 40 },
        { wch: 6 },
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "발송목록");
      const now = new Date();
      const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(
        now.getDate()
      ).padStart(2, "0")}`;
      XLSX.writeFile(wb, `다름_발송목록_${stamp}.xlsx`);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "엑셀을 만들지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  const options = [SHIPPING_TARGET, ...ORDER_TABS.map((t) => t.key)];

  return (
    <Modal
      open={open}
      onClose={busy ? () => undefined : onClose}
      title="엑셀 내려받기"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="border border-ink-200 bg-cream-50 px-4 py-2.5 text-sm text-ink-700 transition-colors hover:bg-cream-100 disabled:opacity-50"
          >
            닫기
          </button>
          <button
            type="button"
            onClick={download}
            disabled={busy || counting || count === 0}
            className="bg-forest-700 px-4 py-2.5 text-sm text-cream-50 transition-colors hover:bg-forest-800 disabled:opacity-50"
          >
            {busy
              ? "만드는 중…"
              : count == null
                ? "엑셀 받기"
                : `${count.toLocaleString("ko-KR")}건 엑셀 받기`}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm leading-relaxed text-ink-600">
          어떤 주문을 내보낼까요? 지금 걸어 둔 검색어와 기간은 그대로 적용됩니다.
        </p>

        <div className="space-y-1.5">
          {options.map((key) => (
            <label
              key={key}
              className={`flex cursor-pointer items-center gap-2.5 border px-3.5 py-2.5 text-sm transition-colors ${
                target === key
                  ? "border-forest-700 bg-forest-100 text-ink-900"
                  : "border-ink-200 bg-cream-50 text-ink-600 hover:bg-cream-100"
              }`}
            >
              <input
                type="radio"
                name="export-target"
                checked={target === key}
                onChange={() => setTarget(key)}
                className="accent-[#2f5d4a]"
              />
              {targetLabel(key)}
              {key === tab && <span className="text-xs text-ink-400">(지금 보는 탭)</span>}
            </label>
          ))}
        </div>

        <p className="text-sm text-ink-600">
          {counting
            ? "대상을 세는 중…"
            : count == null
              ? ""
              : `대상 ${count.toLocaleString("ko-KR")}건`}
        </p>

        {truncated && (
          <p className="border border-signal-red/40 bg-[#f9efe9] px-3.5 py-3 text-sm leading-relaxed text-signal-red">
            조건에 {count?.toLocaleString("ko-KR")}건이 있어 앞의 1,000건만 담깁니다. 기간을 나눠
            두 번에 걸쳐 받아 주세요.
          </p>
        )}

        <Help>
          맨 앞 세 칸(주문번호 · 택배사 · 운송장번호)은 비어 있습니다. 택배사에서 받은 운송장 번호를
          그 칸에 채워 다시 올리면 한 번에 등록됩니다.
        </Help>
        {error && <Help tone="error">{error}</Help>}
      </div>
    </Modal>
  );
}
