"use client";

/* 배너/팝업/공지 탭 공용 헬퍼 + 소형 컴포넌트 */

import { Input } from "@/components/admin/Field";

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

/** 노출 기간 from/to 입력 쌍 */
export function PeriodInputs({
  from,
  to,
  onChange,
}: {
  from: string;
  to: string;
  onChange: (next: { from: string; to: string }) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Input
        aria-label="노출 시작일"
        type="date"
        className="max-w-44"
        value={from}
        max={to || undefined}
        onChange={(e) => onChange({ from: e.target.value, to })}
      />
      <span aria-hidden className="text-ink-300">
        –
      </span>
      <Input
        aria-label="노출 종료일"
        type="date"
        className="max-w-44"
        value={to}
        min={from || undefined}
        onChange={(e) => onChange({ from, to: e.target.value })}
      />
    </div>
  );
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
          className="border border-ink-200 bg-cream-50 px-4 py-2 text-sm text-ink-700 transition-colors hover:bg-cream-100"
        >
          취소
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="bg-forest-700 px-4 py-2 text-sm text-cream-50 transition-colors hover:bg-forest-800 disabled:opacity-50"
        >
          {saving ? "저장 중…" : "저장"}
        </button>
      </div>
    </div>
  );
}

/** 노출 기간 텍스트 */
export function periodLabel(starts_at: string | null, ends_at: string | null): string {
  if (!starts_at && !ends_at) return "상시";
  const from = isoToKstDate(starts_at).replaceAll("-", ".");
  const to = isoToKstDate(ends_at).replaceAll("-", ".");
  return `${from} – ${to}`.trim();
}

/** 공용 JSON fetch — 실패 시 Error(사용자 메시지) throw */
export async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(
      (body as { error?: string } | null)?.error ?? "요청을 처리하지 못했습니다."
    );
  }
  return body as T;
}
