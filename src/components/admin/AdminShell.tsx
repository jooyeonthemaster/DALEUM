"use client";

import { useCallback, useEffect, useState } from "react";
import AdminHeader from "./AdminHeader";
import AdminSidebar from "./AdminSidebar";

interface AdminShellProps {
  adminName: string | null;
  children: React.ReactNode;
}

/**
 * 관리자 셸 — 데스크톱: 좌측 고정 사이드바 / 모바일: 드로어.
 * app/admin/layout.tsx에서 서버가 adminName을 조회해 전달한다.
 */
export default function AdminShell({ adminName, children }: AdminShellProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  // 드로어 열림: ESC 닫기 + 배경 스크롤 잠금
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeDrawer();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [drawerOpen, closeDrawer]);

  return (
    <div className="min-h-dvh w-full bg-cream-50">
      {/* 데스크톱 사이드바 */}
      <div className="fixed inset-y-0 left-0 z-40 hidden w-60 border-r border-ink-200 lg:block">
        <AdminSidebar />
      </div>

      {/* 모바일 드로어 */}
      <div
        className={`fixed inset-0 z-50 lg:hidden ${drawerOpen ? "" : "pointer-events-none"}`}
        aria-hidden={!drawerOpen}
      >
        <div
          className={`absolute inset-0 bg-forest-950/40 transition-opacity duration-300 ${
            drawerOpen ? "opacity-100" : "opacity-0"
          }`}
          onClick={closeDrawer}
          aria-hidden
        />
        <div
          className={`absolute inset-y-0 left-0 w-72 max-w-[85vw] border-r border-ink-200 bg-cream-50 transition-transform duration-300 ease-hall ${
            drawerOpen ? "translate-x-0" : "-translate-x-full"
          }`}
          role="dialog"
          aria-modal="true"
          aria-label="관리자 메뉴"
        >
          <AdminSidebar onNavigate={closeDrawer} />
        </div>
      </div>

      {/* 콘텐츠 영역 */}
      <div className="flex min-h-dvh flex-col lg:pl-60">
        <AdminHeader adminName={adminName} onMenuClick={() => setDrawerOpen(true)} />
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
