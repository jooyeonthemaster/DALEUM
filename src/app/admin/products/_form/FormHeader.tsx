"use client";

/* ============================================================
   상품 폼 헤더 — 제목 옆에 '확인' 과 '복제' 를 둔다.

   왜 여기에 두었나:
   - 저장한 상품이 고객 화면에서 어떻게 보이는지 확인할 길이 폼 어디에도 없었다. 확인하려면
     새 탭을 열어 상품 주소를 손으로 타이핑해야 했고, 결국 아무도 확인하지 않았다.
   - 원산지·영양정보·상세설명이 똑같은 '10입 / 20입 / 30입' 형제 상품을 낼 때마다 20개 필드를
     처음부터 다시 쳤다. 옮겨 적다 원산지·알레르기 표기가 틀리면 표시광고법 문제가 된다.

   '스토어에서 보기' 는 임시 저장·숨김 상태에서는 고객 페이지가 존재하지 않는다(스토어는
   판매중·품절만 조회한다). 그래서 링크를 그냥 두지 않고 왜 안 열리는지를 말해 준다.
   ============================================================ */

import Link from "next/link";
import { ChevronLeft, Copy, ExternalLink, Eye } from "lucide-react";
import type { ProductStatus } from "@/lib/types";

export interface FormHeaderProps {
  isNew: boolean;
  title: string;
  slug: string;
  status: ProductStatus;
  /** 아직 한 번도 저장되지 않았으면 스토어에 페이지 자체가 없다 */
  saved: boolean;
  onPreview: () => void;
  onDuplicate: () => void;
}

const HEADER_BTN =
  "inline-flex items-center gap-1.5 border border-ink-200 bg-cream-50 px-3 py-2 text-xs text-ink-700 transition-colors hover:bg-cream-100";

export default function FormHeader({
  isNew,
  title,
  slug,
  status,
  saved,
  onPreview,
  onDuplicate,
}: FormHeaderProps) {
  const visibleInStore = status === "active" || status === "sold_out";
  const storeReady = saved && slug.trim() !== "" && visibleInStore;

  return (
    <div className="mb-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            href="/admin/products"
            className="inline-flex items-center gap-1 text-xs text-ink-400 transition-colors hover:text-forest-700"
          >
            <ChevronLeft size={14} strokeWidth={1.5} />
            상품 목록
          </Link>
          <h1 className="mt-1 truncate text-xl font-semibold text-ink-900">
            {isNew ? "새 상품 등록" : title || "상품 편집"}
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={onPreview} className={HEADER_BTN}>
            <Eye size={14} strokeWidth={1.5} />
            고객 화면 미리보기
          </button>
          {!isNew && (
            <button type="button" onClick={onDuplicate} className={HEADER_BTN}>
              <Copy size={14} strokeWidth={1.5} />
              이 상품 복제
            </button>
          )}
          {storeReady && (
            <a
              href={`/products/${slug.trim()}`}
              target="_blank"
              rel="noreferrer"
              className={HEADER_BTN}
            >
              <ExternalLink size={14} strokeWidth={1.5} />
              스토어에서 보기
            </a>
          )}
        </div>
      </div>

      {!isNew && !visibleInStore && (
        <p className="mt-2 text-xs leading-relaxed text-signal-amber">
          지금은 고객 화면에 이 상품 페이지가 없어 스토어에서 열어 볼 수 없습니다. 판매 상태를
          &lsquo;판매중&rsquo; 으로 바꾸면 열립니다. 그전에는 &lsquo;고객 화면 미리보기&rsquo; 로 확인해 주세요.
        </p>
      )}
    </div>
  );
}
