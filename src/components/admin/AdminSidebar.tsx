"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUpRight } from "lucide-react";

export interface AdminMenuItem {
  href: string;
  label: string;
}

export interface AdminMenuGroup {
  group: string;
  items: AdminMenuItem[];
}

/** 관리자 메뉴 정의 — AdminHeader의 타이틀 추론에도 사용 */
export const ADMIN_MENU: AdminMenuGroup[] = [
  {
    group: "운영",
    items: [
      { href: "/admin", label: "대시보드" },
      { href: "/admin/orders", label: "주문 관리" },
      { href: "/admin/inventory", label: "재고 관리" },
    ],
  },
  {
    group: "카탈로그",
    items: [
      { href: "/admin/products", label: "상품 관리" },
      { href: "/admin/categories", label: "카테고리" },
    ],
  },
  {
    group: "고객",
    items: [
      { href: "/admin/customers", label: "고객 관리" },
      { href: "/admin/reviews", label: "리뷰 관리" },
    ],
  },
  {
    group: "VIP",
    items: [
      { href: "/admin/vip", label: "VIP 관리" },
      { href: "/admin/vip/campaigns", label: "VIP 캠페인" },
    ],
  },
  {
    group: "마케팅",
    items: [
      { href: "/admin/coupons", label: "쿠폰" },
      { href: "/admin/content", label: "콘텐츠" },
    ],
  },
  {
    group: "인사이트",
    items: [{ href: "/admin/analytics", label: "분석" }],
  },
  {
    group: "설정",
    items: [{ href: "/admin/settings", label: "설정" }],
  },
];

function matches(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(href + "/");
}

/** 현재 경로에 가장 깊게 매칭되는 메뉴 href (하위 상세 경로 포함) */
export function findActiveHref(pathname: string): string | null {
  let best: string | null = null;
  for (const group of ADMIN_MENU) {
    for (const item of group.items) {
      if (matches(pathname, item.href) && (!best || item.href.length > best.length)) {
        best = item.href;
      }
    }
  }
  return best;
}

/** 경로 → 상단바 타이틀 (예: /admin/orders/123 → "주문 관리") */
export function findAdminTitle(pathname: string): string {
  const active = findActiveHref(pathname);
  if (!active) return "관리자";
  for (const group of ADMIN_MENU) {
    for (const item of group.items) {
      if (item.href === active) return item.label;
    }
  }
  return "관리자";
}

interface AdminSidebarProps {
  /** 모바일 드로어에서 링크 클릭 시 드로어 닫기용 */
  onNavigate?: () => void;
}

export default function AdminSidebar({ onNavigate }: AdminSidebarProps) {
  const pathname = usePathname() ?? "/admin";
  const activeHref = findActiveHref(pathname);

  return (
    <aside className="flex h-full w-full flex-col bg-cream-50">
      {/* 브랜드 */}
      <div className="flex h-14 shrink-0 items-center px-6 hairline-b">
        <Link
          href="/admin"
          onClick={onNavigate}
          className="flex items-baseline gap-2"
          aria-label="관리자 대시보드로 이동"
        >
          <span className="headline-serif text-lg text-ink-900">다름</span>
          <span className="label-caps text-forest-700">Admin</span>
        </Link>
      </div>

      {/* 메뉴 */}
      <nav className="flex-1 overflow-y-auto py-5" aria-label="관리자 메뉴">
        {ADMIN_MENU.map((group) => (
          <div key={group.group} className="mb-6 last:mb-0">
            <p className="label-caps px-6 pb-2 text-ink-400">{group.group}</p>
            <ul>
              {group.items.map((item) => {
                const active = item.href === activeHref;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      className={`relative flex items-center px-6 py-2.5 text-sm transition-colors duration-200 ${
                        active
                          ? "bg-forest-50 font-semibold text-forest-800"
                          : "text-ink-600 hover:bg-cream-100 hover:text-ink-900"
                      }`}
                    >
                      {active && (
                        <span
                          aria-hidden
                          className="absolute inset-y-0 left-0 w-0.5 bg-forest-600"
                        />
                      )}
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* 스토어 보기 */}
      <div className="shrink-0 px-6 py-4 hairline-t">
        <Link
          href="/"
          target="_blank"
          rel="noopener"
          className="inline-flex items-center gap-1.5 text-sm text-ink-600 transition-colors hover:text-forest-700"
        >
          스토어 보기
          <ArrowUpRight size={16} strokeWidth={1.5} />
        </Link>
      </div>
    </aside>
  );
}
