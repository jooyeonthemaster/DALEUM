import Reveal from "@/components/shop/Reveal";

export interface TimelineEntry {
  /** "2019.07" 형식 */
  date: string;
  title: string;
  description?: string;
}

export interface HistoryTimelineProps {
  entries: TimelineEntry[];
  className?: string;
}

/**
 * 세로 연혁 타임라인 — 연도는 세리프 대형, 항목은 헤어라인으로 연결.
 * 같은 연도는 하나의 그룹으로 묶어 렌더한다. (서버 컴포넌트)
 *
 * 모션: 연도 구분선이 좌→우로 그어지고(rule), 연도가 왼쪽에서 미끄러져
 * 들어오며(left), 세로 연결선은 위에서 아래로 그려지고(clip), 항목이
 * 순서대로 떠오른다(delay 스태거).
 */
export default function HistoryTimeline({
  entries,
  className = "",
}: HistoryTimelineProps) {
  const groups: { year: string; items: TimelineEntry[] }[] = [];
  for (const entry of entries) {
    const year = entry.date.slice(0, 4);
    const last = groups[groups.length - 1];
    if (last && last.year === year) last.items.push(entry);
    else groups.push({ year, items: [entry] });
  }

  return (
    <div className={className}>
      {groups.map((group, gi) => (
        <div
          key={group.year}
          className={`relative grid grid-cols-[4.25rem_1fr] gap-x-6 pt-8 md:grid-cols-[13rem_1fr] md:gap-x-12 md:pt-10 ${
            gi === groups.length - 1 ? "pb-2" : "pb-10 md:pb-16"
          }`}
        >
          {/* 연도 구분 헤어라인 — 좌→우로 그어진다 */}
          <Reveal
            variant="rule"
            className="absolute inset-x-0 top-0 h-px bg-ink-200"
          />

          <Reveal variant="left" delay={0.1}>
            <p className="krw headline-serif pt-0.5 text-2xl leading-none text-forest-700 md:text-6xl">
              {group.year}
            </p>
          </Reveal>

          <ol className="relative space-y-9 md:space-y-10">
            {/* 세로 연결선 — 위에서 아래로 그려진다 */}
            <Reveal variant="clip" delay={0.15} className="absolute inset-y-1 left-0 w-px">
              <span className="block h-full w-full bg-ink-200" />
            </Reveal>

            {group.items.map((item, i) => (
              <Reveal
                as="li"
                key={`${item.date}-${item.title}`}
                delay={0.2 + i * 0.08}
                className="relative pl-7 md:pl-11"
              >
                <span
                  aria-hidden
                  className="absolute top-[7px] -left-[3.5px] block h-1.5 w-1.5 rounded-full bg-forest-600"
                />
                <p className="label-caps krw text-ink-400">{item.date}</p>
                <p className="mt-2 text-[15px] font-medium text-ink-900 md:text-base">
                  {item.title}
                </p>
                {item.description && (
                  <p className="mt-1.5 max-w-lg text-sm leading-relaxed text-pretty text-ink-500">
                    {item.description}
                  </p>
                )}
              </Reveal>
            ))}
          </ol>
        </div>
      ))}
    </div>
  );
}
