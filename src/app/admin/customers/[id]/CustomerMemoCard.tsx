"use client";

/* ============================================================
   고객 메모 — 자동저장을 유지하되, 사라지지 않게 만든다

   무엇이 문제였나:
   메모는 마지막 입력 후 0.9초가 지나야 저장됐다. 상담 중 "내일 재통화 요청" 을 적고
   곧바로 뒤로가기를 누르거나 다른 고객으로 넘어가면 그 0.9초가 지나기 전에 화면이 사라져
   메모가 통째로 날아갔다. 사라졌다는 사실조차 알려주지 않아, 다음에 그 고객을 열었을 때
   빈 메모를 보고 "분명히 적었는데" 하며 혼란만 남았다.

   그래서 세 가지를 건다.
   1) 화면을 벗어날 때(컴포넌트 정리·탭 닫기) 아직 저장 안 된 값을 즉시 밀어 넣는다.
      브라우저가 화면을 걷어낸 뒤에도 요청이 살아 있어야 하므로 keepalive 로 보낸다.
   2) 탭을 닫거나 새로고침하려 하면 브라우저 기본 경고를 띄운다.
   3) 자동저장을 믿지 못하는 사람을 위해 [저장] 버튼과 저장 시각을 함께 보여준다.
   ============================================================ */

import { useCallback, useEffect, useRef, useState } from "react";
import { Textarea } from "@/components/admin/Field";
import { Section } from "./customer-detail-ui";

const AUTOSAVE_DELAY = 900;

type MemoStatus = "idle" | "typing" | "saving" | "saved" | "error";

export interface CustomerMemoCardProps {
  customerId: string;
  initialMemo: string;
}

/** 14:32 — 방금 저장됐다는 사실을 시각으로 확인시킨다 */
function clock(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export default function CustomerMemoCard({ customerId, initialMemo }: CustomerMemoCardProps) {
  const [memo, setMemo] = useState(initialMemo);
  const [status, setStatus] = useState<MemoStatus>("idle");
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 아직 서버에 넣지 못한 값. null 이면 저장할 것이 없다 */
  const unsaved = useRef<string | null>(null);
  const alive = useRef(true);

  const send = useCallback(
    async (value: string, keepalive: boolean): Promise<boolean> => {
      const res = await fetch(`/api/admin/customers/${customerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memo: value }),
        keepalive,
      });
      return res.ok;
    },
    [customerId]
  );

  const save = useCallback(
    async (value: string) => {
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
      setStatus("saving");
      try {
        const ok = await send(value, false);
        if (!alive.current) return;
        if (!ok) {
          setStatus("error");
          return;
        }
        unsaved.current = null;
        setSavedAt(clock(new Date()));
        setStatus("saved");
      } catch {
        if (alive.current) setStatus("error");
      }
    },
    [send]
  );

  function onChange(value: string) {
    setMemo(value);
    setStatus("typing");
    unsaved.current = value;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(value), AUTOSAVE_DELAY);
  }

  useEffect(() => {
    alive.current = true;

    // 탭을 닫거나 새로고침하려 할 때: 마지막 값을 밀어 넣고 브라우저 경고를 띄운다
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      const pending = unsaved.current;
      if (pending === null) return;
      void send(pending, true);
      e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);

    return () => {
      alive.current = false;
      window.removeEventListener("beforeunload", onBeforeUnload);
      if (timer.current) clearTimeout(timer.current);
      // 다른 화면으로 넘어가는 순간 — 여기서 상태를 바꾸면 이미 사라진 컴포넌트다.
      // 저장만 시키고 결과는 보지 않는다(keepalive 라 화면이 사라져도 요청은 끝까지 간다).
      const pending = unsaved.current;
      if (pending !== null) void send(pending, true);
    };
  }, [send]);

  const dirty = status === "typing" || status === "error";

  return (
    <Section
      title="관리자 메모"
      action={
        <span className={`text-xs ${status === "error" ? "text-signal-red" : "text-ink-400"}`}>
          {status === "typing" && "작성 중…"}
          {status === "saving" && "저장 중…"}
          {status === "saved" && `저장됨${savedAt ? ` (${savedAt})` : ""}`}
          {status === "error" && "저장 실패"}
        </span>
      }
    >
      <Textarea
        value={memo}
        rows={5}
        placeholder="고객 관련 메모를 적어 두세요. 입력을 멈추면 자동으로 저장됩니다."
        onChange={(e) => onChange(e.target.value)}
      />

      {status === "error" && (
        <div
          role="alert"
          className="mt-2 flex flex-wrap items-center justify-between gap-2 border border-signal-red/40 bg-signal-red/5 px-3 py-2.5"
        >
          <p className="text-xs leading-relaxed text-signal-red">
            메모를 저장하지 못했습니다. 이 화면을 벗어나면 방금 적은 내용이 사라집니다.
          </p>
          <button
            type="button"
            onClick={() => void save(memo)}
            className="border border-signal-red/50 px-3 py-1.5 text-xs text-signal-red transition-colors hover:bg-signal-red/10"
          >
            다시 시도
          </button>
        </div>
      )}

      <div className="mt-2 flex items-center justify-between gap-3">
        <p className="text-xs text-ink-400">이 메모는 관리자만 볼 수 있습니다.</p>
        <button
          type="button"
          onClick={() => void save(memo)}
          disabled={status === "saving" || !dirty}
          className="border border-ink-200 px-3.5 py-2 text-[13px] text-ink-700 transition-colors hover:border-ink-400 disabled:border-ink-100 disabled:text-ink-300"
        >
          {status === "saving" ? "저장 중…" : "저장"}
        </button>
      </div>
    </Section>
  );
}
