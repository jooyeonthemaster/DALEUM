"use client";

/* ============================================================
   업소용·OEM 문의 화면의 공통 조각 — 상태 배지 / 상태 뜻풀이 / 관심 품목 표시

   왜 따로 두는가: 목록과 상세 모달이 같은 것을 서로 다르게 보여주면
   대표가 목록에서 본 것과 모달에서 본 것이 같은 문의인지 헷갈린다.
   ============================================================ */

import Image from "next/image";
import Link from "next/link";
import {
  BULK_INQUIRY_STATUS_LABELS,
  BULK_INQUIRY_STATUS_TONES,
} from "@/lib/constants";
import type { BulkInquiry, BulkInquiryStatus } from "@/lib/types";

/** 관심 품목 — 서버가 상품 주소를 상품명으로 바꿔 내려준다 */
export interface InquiryItem {
  /** 상품이 지워졌거나 주소가 바뀌었으면 null */
  id: string | null;
  name: string;
  thumbnail: string | null;
}

export interface AdminBulkInquiry extends BulkInquiry {
  items: InquiryItem[];
}

export const STATUS_ORDER: BulkInquiryStatus[] = [
  "new",
  "contacted",
  "quoted",
  "closed",
  "spam",
];

/**
 * 상태 이름만으로는 무엇을 뜻하는지 알 수 없다 — 고를 때 옆에 붙여 준다.
 * ('연락 완료' 가 통화만 한 것인지 견적까지 보낸 것인지 사람마다 다르게 쓰면 목록이 무의미해진다)
 */
export const STATUS_MEANINGS: Record<BulkInquiryStatus, string> = {
  new: "아직 아무도 연락하지 않은 문의입니다. 여기서부터 처리를 시작합니다.",
  contacted: "전화나 메일로 한 번 이상 연락이 닿았고, 아직 견적은 보내지 않은 상태입니다.",
  quoted: "단가·조건을 담은 견적을 보낸 상태입니다. 거래처 회신을 기다립니다.",
  closed: "거래가 성사됐거나 더 진행하지 않기로 한 문의입니다.",
  spam: "광고·장난 문의입니다. 목록에서 걸러 두되 기록은 남습니다.",
};

export function StatusPill({ status }: { status: BulkInquiryStatus }) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${BULK_INQUIRY_STATUS_TONES[status]}`}
    >
      {BULK_INQUIRY_STATUS_LABELS[status]}
    </span>
  );
}

/** 목록 한 칸에 들어갈 짧은 요약 — '곤약밥 500g 외 2건' */
export function itemsSummary(items: InquiryItem[]): string {
  if (items.length === 0) return "";
  return items.length > 1 ? `${items[0].name} 외 ${items.length - 1}건` : items[0].name;
}

/**
 * 관심 품목 칩 — 상품명과 사진을 함께 보여주고, 살아 있는 상품이면 상품 화면으로 넘어간다.
 * 고객 폼은 상품 주소만 저장하므로, 상품이 지워지면 이름을 되살릴 방법이 없다.
 * 그럴 때 빈칸 대신 '판매 종료 상품' 이라고 적어 무엇이 비어 있는지 알 수 있게 한다.
 */
export function InquiryItemChips({ items }: { items: InquiryItem[] }) {
  if (items.length === 0) {
    return <span className="text-sm text-ink-400">고른 품목 없이 문의만 남겼습니다.</span>;
  }

  return (
    <ul className="flex flex-wrap gap-2">
      {items.map((item, i) => {
        const inner = (
          <>
            <span className="relative block h-10 w-10 shrink-0 overflow-hidden bg-cream-100">
              {item.thumbnail && (
                <Image src={item.thumbnail} alt="" fill sizes="40px" className="object-cover" />
              )}
            </span>
            <span className="pr-1 text-[13px] leading-tight text-ink-800">{item.name}</span>
          </>
        );

        return (
          <li key={`${item.id ?? "gone"}-${i}`}>
            {item.id ? (
              <Link
                href={`/admin/products/${item.id}`}
                className="flex items-center gap-2 border border-ink-200 bg-cream-50 py-1 pl-1 pr-2 transition-colors hover:border-forest-600"
              >
                {inner}
              </Link>
            ) : (
              <span className="flex items-center gap-2 border border-dashed border-ink-200 bg-cream-100 py-1 pl-1 pr-2 text-ink-400">
                {inner}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
