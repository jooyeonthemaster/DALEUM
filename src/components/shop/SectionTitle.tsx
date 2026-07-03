import Link from "next/link";

export interface SectionTitleProps {
  /** label-caps 오버라인 — 예: "Fermented Konjac" */
  overline?: string;
  /** headline-serif 타이틀 */
  title: string;
  /** 우측 하단 정렬 액션 링크 — 예: { href: "/products", label: "전체 보기" } */
  action?: { href: string; label: string };
  className?: string;
}

/** 섹션 헤더 — 오버라인 + 세리프 타이틀 + 우측 액션 링크 */
export default function SectionTitle({
  overline,
  title,
  action,
  className = "",
}: SectionTitleProps) {
  return (
    <div className={`flex items-end justify-between gap-6 ${className}`}>
      <div>
        {overline && (
          <p className="label-caps mb-3 text-forest-600">{overline}</p>
        )}
        <h2 className="headline-serif text-2xl text-ink-900 md:text-[2rem]">
          {title}
        </h2>
      </div>
      {action && (
        <Link
          href={action.href}
          className="link-line label-caps shrink-0 pb-1 text-ink-600 transition-colors hover:text-ink-900"
        >
          {action.label}
        </Link>
      )}
    </div>
  );
}
