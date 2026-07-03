"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/mypage/orders", label: "주문 내역" },
  { href: "/mypage/addresses", label: "배송지 관리" },
  { href: "/mypage/wishlist", label: "위시리스트" },
  { href: "/mypage/reviews", label: "나의 리뷰" },
  { href: "/mypage/profile", label: "회원 정보" },
] as const;

/**
 * 마이페이지 내비 — 데스크톱은 좌측 세로 목록, 모바일은 상단 가로 스크롤 탭.
 */
export default function MypageNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="마이페이지 메뉴" className="lg:sticky lg:top-28 lg:self-start">
      <ul className="flex gap-6 overflow-x-auto border-b border-ink-200 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:block lg:space-y-1 lg:border-b-0">
        {ITEMS.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <li key={item.href} className="shrink-0">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`block whitespace-nowrap border-b-2 pb-3 text-sm transition-colors duration-300 lg:border-b-0 lg:border-l-2 lg:py-2 lg:pb-2 lg:pl-5 ${
                  active
                    ? "border-forest-700 font-medium text-ink-900"
                    : "border-transparent text-ink-500 hover:text-ink-900 lg:border-ink-100"
                }`}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
