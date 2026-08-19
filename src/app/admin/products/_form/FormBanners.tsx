"use client";

/* ============================================================
   상품 폼 상단 알림 띠 세 종류.

   옛 폼은 알림이 문장 하나짜리 회색 배너 한 줄이었다. 그래서
   - 저장이 막힌 이유가 여러 개여도 한 개만 보였고,
   - 신규 등록은 성공 메시지 자체가 없어 저장됐는지 확신할 수 없었으며,
   - 작성 중이던 내용이 남아 있다는 사실은 알릴 자리조차 없었다.

   세 가지를 각각의 띠로 나눈다 — 성격이 다르면 색과 행동 버튼도 달라야 한다.
   ============================================================ */

import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, History } from "lucide-react";
import type { FormIssue, FormTabKey } from "./validate";

const TAB_NAMES: Record<FormTabKey, string> = {
  basic: "기본 정보",
  images: "이미지",
  variants: "옵션",
  detail: "상세·영양",
};

/* ------------------------------------------------------------ */

export interface DraftRestoreBannerProps {
  savedAt: number;
  onRestore: () => void;
  onDiscard: () => void;
}

/** 이 브라우저에 남아 있는 초안을 이어서 쓸지 묻는 띠 */
export function DraftRestoreBanner({ savedAt, onRestore, onDiscard }: DraftRestoreBannerProps) {
  const d = new Date(savedAt);
  const when = `${d.getMonth() + 1}월 ${d.getDate()}일 ${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes()
  ).padStart(2, "0")}`;
  return (
    <div className="mb-4 flex flex-col gap-3 border border-forest-200 bg-forest-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="flex items-start gap-2 text-sm leading-relaxed text-forest-800">
        <History size={16} strokeWidth={1.5} className="mt-0.5 shrink-0" />
        <span>
          저장하지 않고 나간 작성 내용이 있습니다({when}). 이어서 하시겠어요?
        </span>
      </p>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={onRestore}
          className="bg-forest-700 px-3 py-2 text-xs text-cream-50 transition-colors hover:bg-forest-800"
        >
          이어서 작성하기
        </button>
        <button
          type="button"
          onClick={onDiscard}
          className="border border-ink-200 bg-cream-50 px-3 py-2 text-xs text-ink-600 transition-colors hover:bg-cream-100"
        >
          버리고 새로 쓰기
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ */

export interface IssueBannerProps {
  issues: FormIssue[];
  onGoTo: (issue: FormIssue) => void;
}

/** 저장을 막고 있는 문제 전부를 한 번에 보여 주고, 각 줄에서 해당 탭으로 데려간다 */
export function IssueBanner({ issues, onGoTo }: IssueBannerProps) {
  if (issues.length === 0) return null;
  return (
    <div
      role="alert"
      className="mb-4 border border-signal-red/40 bg-cream-100 px-4 py-3 text-sm text-signal-red"
    >
      <p className="flex items-center gap-2 font-medium">
        <AlertTriangle size={16} strokeWidth={1.5} />
        저장하기 전에 <span className="krw">{issues.length}</span>군데를 고쳐 주세요.
      </p>
      <ul className="mt-2 space-y-1.5">
        {issues.map((issue, i) => (
          <li key={`${issue.tab}-${i}`} className="leading-relaxed">
            <button
              type="button"
              onClick={() => onGoTo(issue)}
              className="text-left underline decoration-signal-red/40 underline-offset-4 transition-colors hover:decoration-signal-red"
            >
              [{TAB_NAMES[issue.tab]}] {issue.message}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------ */

export interface ResultBannerProps {
  tone: "ok" | "error";
  title: string;
  /** 서버가 돌려준 경고처럼 한 줄로 붙지 않는 내용 */
  detail?: string;
  actions?: ReactNode;
}

/** 저장 결과 — 성공(초록)과 '저장은 됐지만 일부 실패'(빨강)를 색으로 구분한다 */
export function ResultBanner({ tone, title, detail, actions }: ResultBannerProps) {
  const ok = tone === "ok";
  return (
    <div
      role="status"
      className={`mb-4 border px-4 py-3 ${
        ok
          ? "border-forest-200 bg-forest-50 text-forest-800"
          : "border-signal-red/40 bg-cream-100 text-signal-red"
      }`}
    >
      <p className="flex items-start gap-2 text-sm font-medium">
        {ok ? (
          <CheckCircle2 size={16} strokeWidth={1.5} className="mt-0.5 shrink-0" />
        ) : (
          <AlertTriangle size={16} strokeWidth={1.5} className="mt-0.5 shrink-0" />
        )}
        <span>{title}</span>
      </p>
      {detail && <p className="mt-1.5 pl-6 text-sm leading-relaxed">{detail}</p>}
      {actions && <div className="mt-3 flex flex-wrap items-center gap-2 pl-6">{actions}</div>}
    </div>
  );
}
