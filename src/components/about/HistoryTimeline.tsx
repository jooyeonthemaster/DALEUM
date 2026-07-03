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
        <Reveal
          key={group.year}
          className="grid grid-cols-[4.25rem_1fr] gap-x-6 md:grid-cols-[13rem_1fr] md:gap-x-12"
        >
          <p className="krw headline-serif pt-0.5 text-2xl leading-none text-forest-700 md:text-6xl">
            {group.year}
          </p>

          <ol
            className={`relative space-y-9 border-l border-ink-200 md:space-y-10 ${
              gi === groups.length - 1 ? "pb-4" : "pb-16 md:pb-24"
            }`}
          >
            {group.items.map((item) => (
              <li key={`${item.date}-${item.title}`} className="relative pl-7 md:pl-11">
                <span
                  aria-hidden
                  className="absolute top-[7px] -left-[3.5px] block h-1.5 w-1.5 rounded-full bg-forest-600"
                />
                <p className="label-caps krw text-ink-400">{item.date}</p>
                <p className="mt-2 text-[15px] font-medium text-ink-900 md:text-base">
                  {item.title}
                </p>
                {item.description && (
                  <p className="mt-1.5 max-w-lg text-sm leading-relaxed text-ink-500">
                    {item.description}
                  </p>
                )}
              </li>
            ))}
          </ol>
        </Reveal>
      ))}
    </div>
  );
}
