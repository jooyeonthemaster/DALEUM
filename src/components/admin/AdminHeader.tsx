"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Menu } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { findAdminTitle } from "./AdminSidebar";

interface AdminHeaderProps {
  /** 관리자 이름 (profiles.name → email 순 폴백) */
  adminName: string | null;
  /** 모바일 햄버거 클릭 → 드로어 열기 */
  onMenuClick?: () => void;
  /** 타이틀 직접 지정 (생략 시 현재 경로에서 추론) */
  title?: string;
}

export default function AdminHeader({ adminName, onMenuClick, title }: AdminHeaderProps) {
  const pathname = usePathname() ?? "/admin";
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  const resolvedTitle = title ?? findAdminTitle(pathname);

  async function handleLogout() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await createClient().auth.signOut();
      router.replace("/login");
      router.refresh();
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 bg-cream-50/90 px-4 backdrop-blur-sm hairline-b sm:px-6 lg:px-10">
      {onMenuClick && (
        <button
          type="button"
          onClick={onMenuClick}
          aria-label="메뉴 열기"
          className="-ml-1.5 p-1.5 text-ink-600 transition-colors hover:text-ink-900 lg:hidden"
        >
          <Menu size={20} strokeWidth={1.5} />
        </button>
      )}

      <h1 className="truncate text-[15px] font-semibold text-ink-900">{resolvedTitle}</h1>

      <div className="ml-auto flex items-center gap-5">
        {adminName && (
          <span className="hidden max-w-48 truncate text-sm text-ink-500 sm:block">
            {adminName} 님
          </span>
        )}
        <button
          type="button"
          onClick={handleLogout}
          disabled={signingOut}
          className="inline-flex items-center gap-1.5 text-sm text-ink-600 transition-colors hover:text-forest-700 disabled:opacity-50"
        >
          <LogOut size={16} strokeWidth={1.5} />
          {signingOut ? "로그아웃 중…" : "로그아웃"}
        </button>
      </div>
    </header>
  );
}
