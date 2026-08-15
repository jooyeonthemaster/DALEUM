import Expandable from "./Expandable";

export interface SpecTableProps {
  /** 라벨 → 값 (nutrition/specs jsonb 그대로) */
  data: Record<string, string | number>;
  /** md 이상에서 2단 배치 */
  columns?: 1 | 2;
  /**
   * 값이 이 줄 수를 넘으면 접고 "자세히 보기"를 붙인다.
   * 원재료·원산지처럼 길이를 알 수 없는 값이 표를 세로로 무너뜨리는 걸 막는다.
   * 영양 정보처럼 값이 짧은 표에서는 지정하지 않는다.
   */
  clampLines?: number;
  className?: string;
}

/** 키/값 헤어라인 표 — 영양 정보·상세 스펙 공용 (서버 컴포넌트) */
export default function SpecTable({
  data,
  columns = 1,
  clampLines,
  className = "",
}: SpecTableProps) {
  const entries = Object.entries(data).filter(
    ([key, value]) => key.trim() !== "" && value !== null && String(value).trim() !== ""
  );
  if (entries.length === 0) return null;

  return (
    <dl
      className={`hairline-t ${
        columns === 2 ? "grid md:grid-cols-2 md:gap-x-12" : ""
      } ${className}`}
    >
      {entries.map(([key, value]) => (
        <div
          key={key}
          className="flex items-baseline justify-between gap-6 border-b border-ink-100 py-3"
        >
          <dt className="shrink-0 text-sm text-ink-500">{key}</dt>
          <dd className="krw min-w-0 text-right text-sm text-ink-900">
            {clampLines ? (
              <Expandable lines={clampLines}>{String(value)}</Expandable>
            ) : (
              String(value)
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}
