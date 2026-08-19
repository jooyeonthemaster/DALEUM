"use client";

/* ============================================================
   업로드 진행 상황과 결과 알림.

   예전에는 진행 표시가 "회색 네모 몇 개 깜빡임" 이 전부라, 몇 장 중 몇 장째인지도
   어느 파일을 다루는 중인지도 알 수 없었다. 30장을 올리면 끝날 때까지 아무것도
   모른 채 기다려야 했고, 그래서 중간에 탭을 닫는 일이 생겼다.

   실패도 마찬가지다. 무엇이 왜 실패했는지 파일명과 함께 남겨야
   그 한 장만 다시 올려서 복구할 수 있다.
   ============================================================ */

export interface UploadProgressInfo {
  done: number;
  total: number;
  /** 지금 다루고 있는 파일명 */
  name: string;
}

export interface UploadFailure {
  name: string;
  reason: string;
}

export interface UploadStatusProps {
  progress: UploadProgressInfo | null;
  /** 막지는 않았지만 알려야 하는 것 — 상한 초과, 이름 중복 등 */
  notes: string[];
  failures: UploadFailure[];
}

export default function UploadStatus({ progress, notes, failures }: UploadStatusProps) {
  const percent = progress ? Math.round((progress.done / Math.max(1, progress.total)) * 100) : 0;

  return (
    <>
      {progress && (
        <div className="mt-3" role="status" aria-live="polite">
          <p className="text-sm text-ink-700">
            사진을 올리는 중 —{" "}
            <span className="krw">
              {progress.done}/{progress.total}
            </span>
            장
          </p>
          {progress.name && <p className="mt-1 truncate text-xs text-ink-400">{progress.name}</p>}
          <div className="mt-2 h-1 w-full max-w-xs bg-ink-100">
            <div
              className="h-full bg-forest-700 transition-all duration-300"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
      )}

      {notes.length > 0 && (
        <ul className="mt-2.5 space-y-1">
          {notes.map((note) => (
            <li key={note} className="text-xs leading-relaxed text-signal-amber">
              {note}
            </li>
          ))}
        </ul>
      )}

      {failures.length > 0 && (
        <ul className="mt-2.5 space-y-1">
          {failures.map((f) => (
            <li key={`${f.name}-${f.reason}`} className="text-xs leading-relaxed text-signal-red">
              &apos;{f.name}&apos; 을 올리지 못했습니다 — {f.reason}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
