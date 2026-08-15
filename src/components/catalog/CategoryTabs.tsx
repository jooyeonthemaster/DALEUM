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

/**
 * 카테고리 필터 탭 — 헤어라인 언더라인 + 개수 표시 (서버 컴포넌트).
 *
 * 좁은 화면에서는 가로 스크롤인데 스크롤바를 양쪽 엔진에서 숨기고 있어,
 * 뒤에 탭이 더 있다는 사실 자체가 보이지 않았다. 우측에 배경색으로 사라지는
 * 페이드를 덮어 잘린 글자가 흐려지게 만들어 스크롤 여지를 드러낸다.
 * (페이드는 pointer-events-none — 마지막 탭의 클릭을 가리면 안 된다)
 */
export default function CategoryTabs({
  items,
  activeSlug,
  sort,
  className = "",
}: CategoryTabsProps) {
  return (
    <nav aria-label="카테고리" className={`relative ${className}`}>
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 z-10 w-10 bg-[linear-gradient(to_right,transparent,var(--color-cream-50))] sm:hidden"
      />
      <ul className="flex gap-x-7 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map((item) => {
          const active = item.slug === activeSlug;
          return (
            <li key={item.slug ?? "all"} className="shrink-0">
              <Link
                href={hrefOf(item.slug, sort)}
                aria-current={active ? "page" : undefined}
                className={`relative block pb-3.5 pt-2.5 text-sm transition-colors ${
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
