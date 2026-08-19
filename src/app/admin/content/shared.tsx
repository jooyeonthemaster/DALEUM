"use client";

/* 배너/팝업/공지 탭 공용 헬퍼 + 소형 컴포넌트 */

import { ExternalLink } from "lucide-react";

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** ISO → KST 기준 yyyy-mm-dd */
export function isoToKstDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(new Date(iso).getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

/** yyyy-mm-dd → KST 자정 ISO (빈 값이면 null) */
export function dateToStartIso(date: string): string | null {
  return date ? `${date}T00:00:00+09:00` : null;
}

/** yyyy-mm-dd → KST 하루 끝 ISO (빈 값이면 null) */
export function dateToEndIso(date: string): string | null {
  return date ? `${date}T23:59:59+09:00` : null;
}

/** 수정 모달 푸터 — 삭제(수정 시) / 취소 / 저장 */
export function EditModalFooter({
  editing,
  saving,
  onDelete,
  onCancel,
  onSave,
}: {
  editing: boolean;
  saving: boolean;
  onDelete: () => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <div className="flex w-full items-center justify-between gap-3">
      <div>
        {editing && (
          <button
            type="button"
            onClick={onDelete}
            className="text-sm text-signal-red transition-colors hover:opacity-80"
          >
            삭제
          </button>
        )}
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="border border-ink-200 bg-cream-50 px-4 py-2.5 text-sm text-ink-700 transition-colors hover:bg-cream-100"
        >
          취소
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="bg-forest-700 px-4 py-2.5 text-sm text-cream-50 transition-colors hover:bg-forest-800 disabled:opacity-50"
        >
          {saving ? "저장 중…" : "저장"}
        </button>
      </div>
    </div>
  );
}

/** 노출 기간 텍스트 — 목록 칸에 들어간다 */
export function periodLabel(starts_at: string | null, ends_at: string | null): string {
  if (!starts_at && !ends_at) return "제한 없음";
  const from = isoToKstDate(starts_at).replaceAll("-", ".");
  const to = isoToKstDate(ends_at).replaceAll("-", ".");
  if (from && !to) return `${from}부터`;
  if (!from && to) return `${to}까지`;
  return `${from} – ${to}`;
}

/**
 * 고객 화면을 직접 열어 결과를 눈으로 확인하는 링크.
 * 저장했는데 안 보이는 사고가 반복되던 자리라, 확인 통로를 화면에 상시로 둔다.
 */
export function StorefrontLink({ href, children }: { href: string; children: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 text-forest-700 underline-offset-2 hover:underline"
    >
      {children}
      <ExternalLink size={12} strokeWidth={1.5} aria-hidden />
    </a>
  );
}

/** 공용 JSON fetch — 실패 시 Error(사용자 메시지) throw */
export async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error((body as { error?: string } | null)?.error ?? "요청을 처리하지 못했습니다.");
  }
  return body as T;
}
