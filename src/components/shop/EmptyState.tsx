import Link from "next/link";

export interface EmptyStateProps {
  /** 세리프 한 문장 — 예: "장바구니가 아직 비어 있습니다." */
  title: string;
  description?: string;
  action?: { href: string; label: string };
  className?: string;
}

/** 빈 상태 — 세리프 문장 중심의 우아한 안내 */
export default function EmptyState({
  title,
  description,
  action,
  className = "",
}: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center px-6 py-24 text-center md:py-32 ${className}`}
    >
      <span className="mb-8 block h-10 w-px bg-ink-200" aria-hidden />
      <p className="headline-serif max-w-md text-xl text-ink-900 md:text-2xl">
        {title}
      </p>
      {description && (
        <p className="mt-4 max-w-sm text-sm leading-relaxed text-ink-500">
          {description}
        </p>
      )}
      {action && (
        <Link
          href={action.href}
          className="label-caps mt-10 inline-block border border-ink-900 px-9 py-3.5 text-ink-900 transition-colors duration-500 hover:bg-ink-900 hover:text-cream-50"
        >
          {action.label}
        </Link>
      )}
    </div>
  );
}
