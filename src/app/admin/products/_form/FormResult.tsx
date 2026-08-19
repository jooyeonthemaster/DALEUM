"use client";

/* ============================================================
   저장 결과 띠 + 그 자리에서 이어서 할 일 버튼들.

   등록을 마친 관리자가 곧바로 하려는 일은 셋 중 하나다 — 고객 화면 확인, 판매 시작,
   비슷한 상품 하나 더 만들기. 옛 폼은 성공 메시지 자체가 없어 셋 다 직접 찾아가야 했다.

   등록은 됐는데 이미지·옵션이 함께 저장되지 않은 경우에는 이동 버튼 대신 '등록된 상품 열기'
   하나만 준다. 이 상태에서 저장을 또 누르면 같은 상품이 하나 더 만들어지기 때문이다.
   ============================================================ */

import Link from "next/link";
import type { ProductStatus } from "@/lib/types";
import { ResultBanner } from "./FormBanners";

export interface SaveResult {
  tone: "ok" | "error";
  title: string;
  detail?: string;
}

export interface FormResultProps {
  result: SaveResult | null;
  isNew: boolean;
  saving: boolean;
  /** 등록에는 성공했지만 일부가 저장되지 않은 경우의 상품 id */
  createdId: string | null;
  slug: string;
  status: ProductStatus;
  onStartSelling: () => void;
  onDuplicate: () => void;
}

const LINK_BTN =
  "border border-ink-200 bg-cream-50 px-3 py-2 text-xs text-ink-700 transition-colors hover:bg-cream-100";
const SOLID_BTN =
  "bg-forest-700 px-3 py-2 text-xs text-cream-50 transition-colors hover:bg-forest-800 disabled:opacity-50";

export default function FormResult({
  result,
  isNew,
  saving,
  createdId,
  slug,
  status,
  onStartSelling,
  onDuplicate,
}: FormResultProps) {
  if (!result) return null;

  const hiddenFromCustomers = status === "draft" || status === "hidden";
  const showRoutine = !isNew && createdId === null;

  return (
    <ResultBanner
      tone={result.tone}
      title={result.title}
      detail={result.detail}
      actions={
        <>
          {createdId && (
            <Link href={`/admin/products/${createdId}`} className={SOLID_BTN}>
              등록된 상품 열어서 이어 고치기
            </Link>
          )}
          {showRoutine && hiddenFromCustomers && (
            <button type="button" onClick={onStartSelling} disabled={saving} className={SOLID_BTN}>
              판매 시작하기
            </button>
          )}
          {showRoutine && !hiddenFromCustomers && slug.trim() !== "" && (
            <a
              href={`/products/${slug.trim()}`}
              target="_blank"
              rel="noreferrer"
              className={LINK_BTN}
            >
              스토어에서 보기
            </a>
          )}
          {showRoutine && (
            <button type="button" onClick={onDuplicate} className={LINK_BTN}>
              비슷한 상품 하나 더 만들기
            </button>
          )}
        </>
      }
    />
  );
}
