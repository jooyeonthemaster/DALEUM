"use client";

import { useEffect, useState } from "react";
import ConfirmDialog from "@/components/admin/ConfirmDialog";

/* ============================================================
   묵은 주문 정리 안내 — 배송중 탭 / 결제대기 탭에만 뜬다

   왜 필요한가:
   ① 'delivered' 로 넘겨 주는 자동 장치가 어디에도 없다. 관리자가 매 주문을 손으로 찍지 않으면
      고객은 구매확정도 리뷰도 영영 못 쓴다(둘 다 배송완료 이후에만 열린다). 하루 50건이면
      50번 상세에 들어가야 해서 현실적으로 방치되고, 배송중 주문만 끝없이 쌓인다.
   ② 결제 직전에 이탈한 입금 대기 주문은 재고를 물고 있지 않지만 정리할 수단이 없었다.

   택배사 배송추적 연동은 이 유닛 범위를 넘는다. 그래서 우선 "발송 후 며칠 지났다" 를 근거로
   한 번에 정리할 수 있게 하고, 무엇이 몇 건 바뀌는지 확인받은 뒤에만 반영한다.

   ⚠ 확인 창이 "결제 전 주문이라" 라고 단정하던 자리다. 결제사 웹훅이 늦게 들어오면 돈은
   이미 받았는데 주문은 입금 대기로 남는다 — 그런 주문을 결제사 취소 없이 취소하면 고객 돈만
   들고 주문이 사라진다. 이제 서버가 결제 기록이 있는 주문을 대상에서 빼고 그 건수를 내려 주며,
   화면은 "빼고 처리한다" 는 사실을 반드시 함께 말한다.
   ============================================================ */

type Scope = "deliverStaleShipped" | "cancelStalePending";

const CONFIG: Record<Scope, { days: number; title: (n: number, d: number) => string; body: (n: number, d: number) => string; action: string }> = {
  deliverStaleShipped: {
    days: 5,
    title: (n, d) => `발송한 지 ${d}일이 지난 배송중 주문이 ${n}건 있습니다.`,
    body: (n, d) =>
      `발송 후 ${d}일이 지난 ${n}건을 배송 완료로 한 번에 바꿉니다.\n배송 완료가 되어야 고객이 구매 확정과 리뷰를 쓸 수 있습니다.\n\n진행할까요?`,
    action: "배송완료로 정리",
  },
  cancelStalePending: {
    days: 3,
    title: (n, d) => `${d}일 넘게 입금이 확인되지 않은 주문이 ${n}건 있습니다.`,
    body: (n, d) =>
      `${d}일 넘게 입금되지 않은 ${n}건을 취소합니다.\n결제 기록이 없는 주문만 고른 것이라 결제사 취소도, 재고 복구도 일어나지 않습니다.\n\n진행할까요?`,
    action: "일괄 취소",
  },
};

interface Props {
  scope: Scope;
  /** 반영 후 목록을 다시 읽는다 */
  onApplied: () => void;
}

export default function OrdersBulkNotice({ scope, onApplied }: Props) {
  const [count, setCount] = useState(0);
  /** 결제 기록이 있어 자동 취소에서 빠진 건수 — 사람이 하나씩 확인해야 하는 주문이다 */
  const [needsReview, setNeedsReview] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const config = CONFIG[scope];

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/admin/orders/bulk-status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scope, days: config.days }),
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (!json) return;
        setCount(json.count ?? 0);
        setNeedsReview(json.needsReview ?? 0);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [scope, config.days]);

  async function apply() {
    const res = await fetch("/api/admin/orders/bulk-status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scope, days: config.days, commit: true }),
    });
    const json = await res.json();
    if (!res.ok) {
      setMessage(json.error ?? "정리하지 못했습니다.");
      return;
    }
    setCount(json.remaining ?? 0);
    setNeedsReview(json.needsReview ?? 0);
    setMessage(
      json.remaining > 0
        ? `${json.applied}건을 정리했습니다. ${json.remaining}건이 남아 한 번 더 눌러 주세요.`
        : `${json.applied}건을 정리했습니다.`
    );
    onApplied();
  }

  // 결제 확인이 필요한 주문은 자동으로 취소하지 않는다 — 그렇다고 조용히 넘기면
  // 그 주문들은 아무도 손대지 않은 채 목록에만 쌓인다. 건수를 반드시 화면에 말한다.
  const reviewNote =
    needsReview > 0
      ? `결제 기록이 있어 결제 확인이 필요한 주문 ${needsReview}건은 빼고 처리합니다. 그 주문은 하나씩 열어 확인해 주세요.`
      : null;

  if (count === 0) {
    if (message) return <Bar tone="done">{message}</Bar>;
    return reviewNote ? <Bar tone="warn">{reviewNote}</Bar> : null;
  }

  return (
    <>
      <Bar tone="warn">
        <span>
          {config.title(count, config.days)}
          {reviewNote && <span className="mt-1 block text-xs text-brass-700">{reviewNote}</span>}
        </span>
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="shrink-0 border border-brass-700 px-3 py-1.5 text-xs text-brass-700 transition-colors hover:bg-brass-700 hover:text-cream-50"
        >
          {config.action}
        </button>
      </Bar>
      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={apply}
        title={config.action}
        description={
          reviewNote
            ? `${config.body(count, config.days).replace("\n\n진행할까요?", "")}\n${reviewNote}\n\n진행할까요?`
            : config.body(count, config.days)
        }
        confirmLabel={config.action}
        danger={scope === "cancelStalePending"}
      />
    </>
  );
}

function Bar({ tone, children }: { tone: "warn" | "done"; children: React.ReactNode }) {
  return (
    <div
      className={`mb-4 flex flex-wrap items-center justify-between gap-3 border px-4 py-3 text-sm ${
        tone === "warn"
          ? "border-brass-700/40 bg-[#faf3e6] text-ink-700"
          : "border-ink-200 bg-cream-100 text-ink-600"
      }`}
    >
      {children}
    </div>
  );
}
