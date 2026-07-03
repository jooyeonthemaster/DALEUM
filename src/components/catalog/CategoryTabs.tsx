import Link from "next/link";

export interface CategoryTabItem {
  /** null이면 "전체" 탭 */
  slug: string | null;
  name: string;
  count: number;
}

export interface CategoryTabsProps {
  items: CategoryTabItem[];
  activeSlug: string | null;
  /** 현재 정렬값 — 탭 이동 시 유지 (latest는 생략) */
  sort?: string;
  className?: string;
}

function hrefOf(slug: string | null, sort?: string): string {
  const params = new URLSearchParams();
  if (slug) params.set("category", slug);
  if (sort && sort !== "latest") params.set("sort", sort);
  const qs = params.toString();
  return qs ? `/products?${qs}` : "/products";
}

/** 카테고리 필터 탭 — 헤어라인 언더라인 + 개수 표시 (서버 컴포넌트) */
export default function CategoryTabs({
  items,
  activeSlug,
  sort,
  className = "",
}: CategoryTabsProps) {
  return (
    <nav aria-label="카테고리" className={className}>
      <ul className="flex gap-x-7 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map((item) => {
          const active = item.slug === activeSlug;
          return (
            <li key={item.slug ?? "all"} className="shrink-0">
              <Link
                href={hrefOf(item.slug, sort)}
                aria-current={active ? "page" : undefined}
                className={`relative block pb-3.5 text-sm transition-colors ${
                  active
                    ? "font-medium text-ink-900"
                    : "text-ink-400 hover:text-ink-700"
                }`}
              >
                {item.name}
                <span
                  className={`krw ml-1.5 align-top text-[11px] ${
                    active ? "text-forest-600" : "text-ink-300"
                  }`}
                >
                  {item.count}
                </span>
                {active && (
                  <span
                    aria-hidden
                    className="absolute inset-x-0 bottom-0 h-px bg-ink-900"
                  />
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
