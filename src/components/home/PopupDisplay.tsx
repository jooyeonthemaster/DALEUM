"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { X } from "lucide-react";
import type { Popup } from "@/lib/types";

export interface PopupDisplayProps {
  /** 활성 + 기간 유효한 팝업 (page.tsx에서 선별해 전달, 없으면 null) */
  popup: Popup | null;
}

const HIDE_MS = 24 * 60 * 60 * 1000;
const storageKey = (id: string) => `daleum_popup_hide_${id}`;

/**
 * 홈 팝업 — 24시간 안 보기(localStorage), position(center/bottom-left/bottom) 지원.
 * 등장은 700ms 지연 후 ease-silk로 우아하게.
 */
export default function PopupDisplay({ popup }: PopupDisplayProps) {
  const [render, setRender] = useState(false);
  const [visible, setVisible] = useState(false);

  // 24시간 안 보기 확인 후 지연 등장
  useEffect(() => {
    if (!popup) return;
    try {
      const raw = localStorage.getItem(storageKey(popup.id));
      if (raw) {
        const hiddenAt = Number(raw);
        if (!Number.isNaN(hiddenAt) && Date.now() - hiddenAt < HIDE_MS) return;
      }
    } catch {
      // localStorage 접근 불가 환경 — 그냥 표시
    }
    const timer = setTimeout(() => setRender(true), 700);
    return () => clearTimeout(timer);
  }, [popup]);

  // 마운트 다음 프레임에 트랜지션 시작
  useEffect(() => {
    if (!render) return;
    const raf = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(raf);
  }, [render]);

  const close = useCallback(
    (hideForDay: boolean) => {
      if (hideForDay && popup) {
        try {
          localStorage.setItem(storageKey(popup.id), String(Date.now()));
        } catch {
          // 저장 실패는 무시
        }
      }
      setVisible(false);
      setTimeout(() => setRender(false), 600);
    },
    [popup]
  );

  // ESC로 닫기
  useEffect(() => {
    if (!render) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [render, close]);

  if (!popup || !render) return null;

  const isCenter = popup.position === "center";
  const wrapperClass =
    popup.position === "center"
      ? "fixed inset-0 z-[90] flex items-center justify-center p-5"
      : popup.position === "bottom-left"
        ? "fixed bottom-5 left-5 z-[90] w-[calc(100vw-2.5rem)] max-w-sm"
        : "fixed inset-x-0 bottom-0 z-[90] flex justify-center p-4 sm:p-6";

  return (
    <div className={wrapperClass}>
      {/* 중앙 팝업만 딤 배경 */}
      {isCenter && (
        <button
          type="button"
          aria-label="팝업 닫기"
          onClick={() => close(false)}
          className={`absolute inset-0 bg-ink-900/45 transition-opacity duration-700 ${
            visible ? "opacity-100" : "opacity-0"
          }`}
        />
      )}

      <div
        role="dialog"
        aria-modal={isCenter}
        aria-label={popup.title}
        className={`relative max-h-[calc(100svh-2.5rem)] w-full max-w-md overflow-hidden overflow-y-auto border border-ink-200 bg-cream-50 transition-all duration-700 ${
          visible ? "translate-y-0 opacity-100" : "translate-y-5 opacity-0"
        }`}
        style={{ transitionTimingFunction: "var(--ease-silk)" }}
      >
        {popup.image_url && (
          <div className="relative aspect-[4/3] w-full bg-cream-100">
            <Image
              src={popup.image_url}
              alt={popup.title}
              fill
              sizes="(min-width: 640px) 448px, 100vw"
              className="object-cover"
            />
            <button
              type="button"
              aria-label="닫기"
              onClick={() => close(false)}
              className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-ink-900/40 text-cream-50 backdrop-blur-sm transition-colors hover:bg-ink-900/60"
            >
              <X size={18} strokeWidth={1.5} />
            </button>
          </div>
        )}

        <div className="px-6 pb-6 pt-6">
          <p className="label-caps text-forest-600">Notice</p>
          <h3 className="headline-serif mt-3 text-lg text-ink-900">
            {popup.title}
          </h3>
          {popup.content && (
            <p className="mt-3 whitespace-pre-line text-[13.5px] leading-relaxed text-ink-600">
              {popup.content}
            </p>
          )}
          {popup.link_url && (
            <Link
              href={popup.link_url}
              onClick={() => close(false)}
              className="link-line label-caps mt-5 inline-block text-forest-700"
            >
              자세히 보기
            </Link>
          )}
        </div>

        <div className="hairline-t flex">
          <button
            type="button"
            onClick={() => close(true)}
            className="label-caps h-11 flex-1 text-[10px] text-ink-500 transition-colors hover:bg-cream-100"
          >
            24시간 동안 보지 않기
          </button>
          <span aria-hidden className="w-px bg-ink-200" />
          <button
            type="button"
            onClick={() => close(false)}
            className="label-caps h-11 flex-1 text-[10px] text-ink-900 transition-colors hover:bg-cream-100"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
