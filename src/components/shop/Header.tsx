"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
} from "react";
import { ChevronDown, Menu, Search, ShoppingBag, X } from "lucide-react";
import { useCart } from "@/store/cart";

/** 레이아웃(서버)에서 내려주는 최소 사용자 정보 */
export interface HeaderUser {
  id: string;
  email: string | null;
  name: string | null;
}

/** 레이아웃(서버)에서 내려주는 카테고리 (is_active, sort_order 정렬 완료 상태) */
export interface ShopCategory {
  id: string;
  slug: string;
  name: string;
}

export interface HeaderProps {
  user: HeaderUser | null;
  categories: ShopCategory[];
}

// hydration 이후 true — 장바구니 뱃지 등 클라이언트 전용 상태 표시용
const emptySubscribe = () => () => {};
function useMounted() {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );
}

const NAV_LEFT = { href: "/products", label: "전체상품" };
const NAV_RIGHT = [
  { href: "/about", label: "브랜드스토리" },
  { href: "/b2b", label: "업소용·OEM" },
  { href: "/support", label: "고객센터" },
];

/**
 * 스토어프론트 스티키 헤더.
 * - 최상단에서는 투명, 스크롤하면 cream-50/95 blur + 헤어라인으로 전환
 * - 홈("/") 최상단에서만 밝은 글자색(다크 히어로 위) — 홈 히어로는 헤더 아래로
 *   깔리도록 첫 섹션에 `-mt-16 md:-mt-20`을 주면 된다 (COMPONENTS_SHOP.md 참고)
 */
export default function Header({ user, categories }: HeaderProps) {
  const pathname = usePathname();
  const router = useRouter();

  const mounted = useMounted();
  const [scrolled, setScrolled] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [catOpen, setCatOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  const cartCount = useCart((s) => s.lines.reduce((n, l) => n + l.qty, 0));

  // 라우트 이동 시 모든 오버레이 닫기 (렌더 중 상태 보정 패턴)
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (prevPathname !== pathname) {
    setPrevPathname(pathname);
    setSearchOpen(false);
    setMobileOpen(false);
    setCatOpen(false);
  }

  // 스크롤 상태
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // ESC로 닫기
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSearchOpen(false);
        setMobileOpen(false);
        setCatOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // 모바일 메뉴 열림 → 배경 스크롤 잠금
  useEffect(() => {
    const html = document.documentElement;
    if (mobileOpen) {
      const prev = html.style.overflow;
      html.style.overflow = "hidden";
      return () => {
        html.style.overflow = prev;
      };
    }
  }, [mobileOpen]);

  // 검색 열리면 입력에 포커스
  useEffect(() => {
    if (searchOpen) {
      const id = requestAnimationFrame(() => searchInputRef.current?.focus());
      return () => cancelAnimationFrame(id);
    }
  }, [searchOpen]);

  const submitSearch = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      const q = query.trim();
      if (!q) return;
      setSearchOpen(false);
      router.push(`/search?q=${encodeURIComponent(q)}`);
    },
    [query, router]
  );

  // 홈 최상단 = 다크 히어로 위 → 밝은 글자
  const overHero =
    pathname === "/" && !scrolled && !searchOpen && !catOpen && !mobileOpen;
  const solid = scrolled || searchOpen || catOpen;

  return (
    <header
      className={`sticky top-0 z-50 transition-colors duration-500 ${
        overHero ? "text-cream-50" : "text-ink-900"
      }`}
    >
      {/* 배경 레이어 — backdrop-filter를 header 자체에 주면 fixed 오버레이가
          헤더 박스에 갇히므로(containing block) 반드시 별도 레이어로 분리 */}
      <div
        aria-hidden
        className={`absolute inset-0 -z-10 transition-opacity duration-500 ${
          solid ? "bg-cream-50/95 backdrop-blur-md hairline-b opacity-100" : "opacity-0"
        }`}
      />
      <div className="container-hall relative flex h-16 items-center justify-between gap-3 md:h-20">
        {/* 로고 */}
        <Link href="/" className="flex shrink-0 items-center" aria-label="다름 DALEUM 홈">
          <Image
            src="/editorial/logo-mark.png"
            alt="다름 DALEUM"
            width={264}
            height={66}
            priority
            className={`h-6 w-auto transition-[filter] duration-500 md:h-7 ${
              overHero ? "invert" : ""
            }`}
          />
        </Link>

        {/* 데스크톱 내비 */}
        <nav
          className="absolute left-1/2 top-0 hidden h-full -translate-x-1/2 items-center gap-9 lg:flex"
          aria-label="주요 메뉴"
        >
          <Link href={NAV_LEFT.href} className="link-line text-sm font-medium">
            {NAV_LEFT.label}
          </Link>

          {/* 카테고리 드롭다운 */}
          {categories.length > 0 && (
            <div
              className="relative flex h-full items-center"
              onMouseEnter={() => setCatOpen(true)}
              onMouseLeave={() => setCatOpen(false)}
            >
              <button
                type="button"
                className="flex items-center gap-1.5 text-sm font-medium"
                aria-haspopup="true"
                aria-expanded={catOpen}
                onClick={() => setCatOpen((v) => !v)}
              >
                카테고리
                <ChevronDown
                  size={14}
                  strokeWidth={1.5}
                  className={`transition-transform duration-500 ${catOpen ? "rotate-180" : ""}`}
                />
              </button>
              <div
                className={`absolute left-1/2 top-full w-60 -translate-x-1/2 border border-ink-200 bg-cream-50 py-3 text-ink-900 transition-all duration-300 ease-hall ${
                  catOpen
                    ? "visible translate-y-0 opacity-100"
                    : "invisible -translate-y-1 opacity-0"
                }`}
              >
                <p className="label-caps px-5 pb-2 pt-1 text-ink-400">Category</p>
                {categories.map((cat) => (
                  <Link
                    key={cat.id}
                    href={`/products?category=${cat.slug}`}
                    className="block px-5 py-2.5 text-sm text-ink-600 transition-colors hover:bg-cream-100 hover:text-ink-900"
                    onClick={() => setCatOpen(false)}
                  >
                    {cat.name}
                  </Link>
                ))}
              </div>
            </div>
          )}

          {NAV_RIGHT.map((item) => (
            <Link key={item.href} href={item.href} className="link-line text-sm font-medium">
              {item.label}
            </Link>
          ))}
        </nav>

        {/* 우측 액션 */}
        <div className="flex shrink-0 items-center gap-0.5 md:gap-1.5">
          <button
            type="button"
            onClick={() => setSearchOpen((v) => !v)}
            aria-label="검색"
            aria-expanded={searchOpen}
            className="p-2"
          >
            <Search size={19} strokeWidth={1.5} />
          </button>

          {user ? (
            <Link
              href="/mypage"
              className="link-line hidden px-1.5 text-[13px] font-medium md:block"
            >
              마이페이지
            </Link>
          ) : (
            <Link
              href="/login"
              className="link-line hidden px-1.5 text-[13px] font-medium md:block"
            >
              로그인
            </Link>
          )}

          <Link href="/cart" aria-label="장바구니" className="relative p-2">
            <ShoppingBag size={19} strokeWidth={1.5} />
            {mounted && cartCount > 0 && (
              <span className="krw absolute right-0 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-forest-600 px-1 text-[10px] font-semibold leading-none text-cream-50">
                {cartCount > 99 ? "99+" : cartCount}
              </span>
            )}
          </Link>

          {/* VIP 라운지 — 브라스 점 하나로 은근하게 */}
          <Link
            href="/vip"
            aria-label="VIP 라운지"
            title="VIP 라운지"
            className="group hidden p-2.5 md:block"
          >
            <span className="block h-[7px] w-[7px] rounded-full bg-brass-500 transition-transform duration-500 ease-hall group-hover:scale-150" />
          </Link>

          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="메뉴 열기"
            className="p-2 lg:hidden"
          >
            <Menu size={20} strokeWidth={1.5} />
          </button>
        </div>
      </div>

      {/* 검색 오버레이 — 헤더 아래 풀와이드 패널 */}
      {searchOpen && (
        <div
          className="fixed inset-0 -z-10 bg-ink-900/25"
          onClick={() => setSearchOpen(false)}
          aria-hidden
        />
      )}
      <div
        className={`absolute inset-x-0 top-full overflow-hidden bg-cream-50 text-ink-900 transition-all duration-500 ease-hall ${
          searchOpen ? "visible max-h-56 opacity-100 hairline-b" : "invisible max-h-0 opacity-0"
        }`}
      >
        <form onSubmit={submitSearch} className="container-hall py-8 md:py-10" role="search">
          <div className="flex items-center gap-4 border-b border-ink-900 pb-3">
            <Search size={20} strokeWidth={1.5} className="shrink-0 text-ink-400" />
            <input
              ref={searchInputRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="찾으시는 상품을 검색해 보세요"
              aria-label="상품 검색"
              className="headline-serif w-full bg-transparent text-lg outline-none placeholder:text-ink-300 md:text-2xl"
            />
            <button
              type="button"
              onClick={() => setSearchOpen(false)}
              aria-label="검색 닫기"
              className="shrink-0 p-1"
            >
              <X size={20} strokeWidth={1.5} />
            </button>
          </div>
          <p className="label-caps mt-3 text-ink-400">Enter 키로 검색</p>
        </form>
      </div>

      {/* 모바일 풀스크린 메뉴 */}
      <div
        data-lenis-prevent
        aria-hidden={!mobileOpen}
        className={`fixed inset-0 z-[60] flex flex-col bg-cream-50 text-ink-900 transition-[opacity,visibility] duration-500 ease-hall lg:hidden ${
          mobileOpen ? "visible opacity-100" : "invisible opacity-0"
        }`}
      >
        <div className="container-hall flex h-16 shrink-0 items-center justify-between">
          <Link
            href="/"
            className="flex items-center"
            onClick={() => setMobileOpen(false)}
          >
            <Image
              src="/editorial/logo-mark.png"
              alt="다름 DALEUM"
              width={264}
              height={66}
              className="h-6 w-auto"
            />
          </Link>
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            aria-label="메뉴 닫기"
            className="-mr-2 p-2"
          >
            <X size={22} strokeWidth={1.5} />
          </button>
        </div>

        <nav
          className="container-hall flex flex-1 flex-col justify-center gap-1 overflow-y-auto py-8"
          aria-label="모바일 메뉴"
        >
          {[NAV_LEFT, ...NAV_RIGHT].map((item, i) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={`headline-serif py-2.5 text-3xl transition-all duration-700 ease-hall ${
                mobileOpen ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0"
              }`}
              style={{ transitionDelay: mobileOpen ? `${120 + i * 70}ms` : "0ms" }}
            >
              {item.label}
            </Link>
          ))}

          {categories.length > 0 && (
            <div
              className={`mt-8 transition-all duration-700 ease-hall ${
                mobileOpen ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0"
              }`}
              style={{ transitionDelay: mobileOpen ? "360ms" : "0ms" }}
            >
              <p className="label-caps mb-3 text-ink-400">Category</p>
              <div className="flex flex-col gap-1">
                {categories.map((cat) => (
                  <Link
                    key={cat.id}
                    href={`/products?category=${cat.slug}`}
                    onClick={() => setMobileOpen(false)}
                    className="py-1.5 text-base text-ink-600"
                  >
                    {cat.name}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </nav>

        <div className="hairline-t shrink-0">
          <div className="container-hall flex items-center justify-between py-5">
            <div className="flex items-center gap-5 text-sm font-medium">
              {user ? (
                <Link href="/mypage" onClick={() => setMobileOpen(false)}>
                  마이페이지
                </Link>
              ) : (
                <Link href="/login" onClick={() => setMobileOpen(false)}>
                  로그인
                </Link>
              )}
              <Link href="/cart" onClick={() => setMobileOpen(false)}>
                장바구니
              </Link>
            </div>
            <Link
              href="/vip"
              onClick={() => setMobileOpen(false)}
              className="label-caps flex items-center gap-2 text-brass-700"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-brass-500" />
              VIP Lounge
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}
