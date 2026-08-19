"use client";

import { useState } from "react";
import { Select, Textarea, Help } from "@/components/admin/Field";
import type { OrderEventView } from "./order-detail-types";

/* ============================================================
   처리 이력 · 관리자 메모

   왜 둘로 나눴는가:
   예전에는 시스템이 남긴 기록(환불·재고·결제 오류)과 사람이 쓰는 메모가 같은 칸을 썼다.
   대표가 메모를 정리하면 '부분 환불 1만원' 같은 기록이 통째로 지워졌고, 반대로 메모칸을
   열어 둔 채 환불하면 시스템 기록이 옛 텍스트로 되덮였다. 나중에 "이 주문 환불했나?" 를
   확인할 근거가 사라지는 구조였다.

   그래서 위쪽은 **덧붙이기만 하는 읽기 전용 이력**(누가·언제·무엇을), 아래쪽은
   자유롭게 고쳐 쓰는 상시 메모로 갈랐다. 서버는 저장할 때 이력을 다시 붙여 준다.
   ============================================================ */

/** 이력 종류별 색 — 돈과 사고가 걸린 것만 눈에 띄게 한다 */
const KIND_TONE: Record<string, string> = {
  "확인 필요": "text-signal-red",
  "부분 환불": "text-brass-700",
  "환불 처리": "text-brass-700",
  "주문 취소": "text-signal-red",
};

interface TimelineProps {
  events: OrderEventView[];
  /** 메모 유형 선택지 — 키는 서버가 알아보는 값이고 화면에는 값(한국어)만 보인다 */
  memoKinds: Record<string, string>;
  onAdd: (kind: string, body: string) => Promise<void>;
}

export function OrderTimeline({ events, memoKinds, onAdd }: TimelineProps) {
  const [kind, setKind] = useState("note");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const kindKeys = Object.keys(memoKinds);

  async function submit() {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onAdd(kind, body);
      setText("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "기록을 남기지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  // 최신 것이 위로 — 방금 통화한 내용을 찾으러 아래까지 내려가게 하지 않는다
  const ordered = [...events].reverse();

  return (
    <section className="border border-ink-200 bg-cream-50">
      <div className="px-5 py-3.5 hairline-b">
        <h2 className="text-[13px] font-semibold tracking-wide text-ink-500">처리 이력</h2>
      </div>

      <div className="space-y-3 p-5 hairline-b">
        {kindKeys.length > 0 && (
          <Select
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            aria-label="기록 종류"
            className="max-w-44"
          >
            {kindKeys.map((k) => (
              <option key={k} value={k}>
                {memoKinds[k]}
              </option>
            ))}
          </Select>
        )}
        <Textarea
          value={text}
          rows={3}
          placeholder="예) 수요일 재발송하기로 통화 완료"
          onChange={(e) => setText(e.target.value)}
        />
        <button
          type="button"
          onClick={submit}
          disabled={busy || text.trim().length === 0}
          className="w-full border border-ink-200 bg-cream-50 px-4 py-2.5 text-sm text-ink-700 transition-colors hover:bg-cream-100 disabled:opacity-50"
        >
          {busy ? "남기는 중…" : "이력 남기기"}
        </button>
        {error && <Help tone="error">{error}</Help>}
        {/* 예전 문구는 "남긴 기록은 지워지지 않습니다" 였는데 사실이 아니었다 —
            한 칸에 담는 분량(8,000자)을 넘기면 환불·취소가 **아닌** 기록부터 접힌다.
            접힌 주문에는 그 사실을 이력 한 줄로 남긴다(order-log.ts 의 MEMO_TRIM_NOTICE). */}
        <Help>
          환불·취소 기록은 지워지지 않습니다. 오래된 통화·메모 기록은 분량이 넘치면 정리될 수
          있습니다. 누가 언제 남겼는지 함께 저장됩니다.
        </Help>
      </div>

      <div className="p-5">
        {ordered.length === 0 ? (
          <p className="text-sm text-ink-400">아직 남은 이력이 없습니다.</p>
        ) : (
          <ol className="space-y-3.5">
            {ordered.map((e, i) => (
              <li key={`${e.at}-${i}`} className="text-sm">
                <p className="flex flex-wrap items-baseline gap-x-2 text-xs text-ink-400">
                  <span className="krw">{e.at}</span>
                  <span className={KIND_TONE[e.kind] ?? "text-ink-600"}>{e.kind}</span>
                  {e.author && <span>{e.author}</span>}
                </p>
                {e.body && (
                  <p className="mt-1 whitespace-pre-line leading-relaxed text-ink-700">{e.body}</p>
                )}
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}

interface MemoProps {
  value: string;
  status: "idle" | "saving" | "saved" | "error";
  onChange: (value: string) => void;
}

/** 상시 메모 — 늘 보여야 하는 한 덩어리 (이력과 달리 자유롭게 고칠 수 있다) */
export function OrderMemoSection({ value, status, onChange }: MemoProps) {
  return (
    <section className="border border-ink-200 bg-cream-50">
      <div className="flex items-center justify-between gap-3 px-5 py-3.5 hairline-b">
        <h2 className="text-[13px] font-semibold tracking-wide text-ink-500">상시 메모</h2>
        <span className={`text-xs ${status === "error" ? "text-signal-red" : "text-ink-400"}`}>
          {status === "saving" && "저장 중…"}
          {status === "saved" && "저장됨"}
          {status === "error" && "저장 실패"}
        </span>
      </div>
      <div className="p-5">
        <Textarea
          value={value}
          rows={5}
          placeholder="이 주문을 볼 때 늘 함께 보여야 할 내용을 적어 두세요. 자동으로 저장됩니다."
          onChange={(e) => onChange(e.target.value)}
        />
        <Help>여기를 고쳐도 위의 처리 이력은 지워지지 않습니다.</Help>
      </div>
    </section>
  );
}
