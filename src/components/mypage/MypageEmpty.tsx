import Link from "next/link";

export interface MypageEmptyProps {
  /** 세리프 한 문장 — 예: "아직 주문 내역이 없습니다." */
  title: string;
  description?: string;
  action?: { href: string; label: string };
  className?: string;
}

/**
 * 마이페이지 전용 빈 상태 — 얇은 보더 패널 + 세리프 문장.
 * 공용 EmptyState(py-24~32)는 패널 안에서 빈 공간이 과도해
 * 마이페이지에서는 이 컴팩트 버전을 쓴다.
 */
export default function MypageEmpty({
  title,
  description,
  action,
  className = "",
}: MypageEmptyProps) {
  return (
    <div
      className={`border border-ink-200 px-6 py-14 text-center md:py-16 ${className}`}
    >
      <span className="mx-auto mb-6 block h-8 w-px bg-ink-300" aria-hidden />
      <p className="headline-serif text-balance text-lg text-ink-900 md:text-xl">
        {title}
      </p>
      {description && (
        <p className="mx-auto mt-3 max-w-xs text-balance text-sm leading-relaxed text-ink-500">
          {description}
        </p>
      )}
      {action && (
        <Link
          href={action.href}
          className="label-caps mt-8 inline-flex min-h-11 items-center border border-ink-900 px-8 text-ink-900 transition-colors duration-500 hover:bg-ink-900 hover:text-cream-50"
        >
          {action.label}
        </Link>
      )}
    </div>
  );
}
