"use client";

/* ============================================================
   선택한 상품 일괄 작업 바.

   목록에서 할 수 있는 유일한 변경이 행마다 붙은 상태 드롭다운 하나뿐이었다.
   카테고리를 옮기거나 추천을 지정하려면 상품을 열고 탭을 옮기고 저장하고 돌아오기를
   상품 수만큼 반복해야 했다(27개면 100번 넘는 클릭). 그래서 선택한 것들에 대해
   한 번에 끝내는 줄을 목록 위에 붙인다.

   화면 맨 위에 붙여 두는(sticky) 이유: 20번째 행을 선택하고 스크롤을 내린 상태에서도
   무엇이 몇 개 선택됐는지와 실행 버튼이 늘 보여야 하기 때문이다.
   ============================================================ */

import { Star, StarOff, Tag, Trash2, X } from "lucide-react";
import { Select } from "@/components/admin/Field";
import type { Category, ProductStatus } from "@/lib/types";
import { BTN_GHOST, PRODUCT_STATUS_OPTIONS } from "../product-ui";

/**
 * 관리자 헤더(AdminHeader) 는 `sticky top-0 z-30` 이고 높이가 h-14(3.5rem)다.
 * 이 줄도 같은 `top-0 z-30` 이었는데, 문서 스크롤을 공유하는 구조에서 z 값이 같으면
 * **DOM 순서가 늦은 쪽이 위에 그려진다** — 그래서 일괄 바가 헤더를 통째로 덮어
 * 로그아웃 버튼과 모바일 메뉴(☰)가 눌리지 않았다(상품을 하나라도 고르는 순간부터).
 * 헤더는 여러 관리자 화면이 함께 쓰는 공용 컴포넌트라 손대지 않고, 이 줄을
 * 헤더 높이만큼 내려(top-14) 헤더보다 아래 층(z-20)에 붙인다.
 * 사이드바 z-40 · 모바일 드로어 z-50 · 모달 z-100 보다 반드시 낮아야 한다.
 */
const BAR_STICKY = "sticky top-14 z-20";

export interface BulkActionBarProps {
  count: number;
  /** 선택한 것 중 판매가가 0원인 상품 수 — 판매중 전환에서 건너뛰는 근거 */
  zeroPriceCount: number;
  categories: Category[];
  busy: boolean;
  onStatus: (status: ProductStatus) => void;
  onCategory: (categoryId: string | null) => void;
  onFeatured: (value: boolean) => void;
  onPriceAdjust: () => void;
  /** 고른 상품 영구 삭제 — 확인창은 호출부(ProductsClient)가 띄운다 */
  onDelete: () => void;
  /** 판매가가 없는 상품만 선택에서 빼기 — 나머지를 그대로 '판매중' 으로 올리기 위한 통로 */
  onDropZeroPrice: () => void;
  onClear: () => void;
}

export default function BulkActionBar({
  count,
  zeroPriceCount,
  categories,
  busy,
  onStatus,
  onCategory,
  onFeatured,
  onPriceAdjust,
  onDelete,
  onDropZeroPrice,
  onClear,
}: BulkActionBarProps) {
  return (
    <div
      className={`${BAR_STICKY} mb-3 border border-forest-600/40 bg-forest-50 px-3 py-3 sm:px-4`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <p className="mr-1 whitespace-nowrap text-sm font-medium text-forest-800">
          <span className="krw">{count}</span>개 선택됨
        </p>

        <Select
          aria-label="선택한 상품의 판매 상태 변경"
          value=""
          disabled={busy}
          onChange={(e) => {
            if (e.target.value) onStatus(e.target.value as ProductStatus);
          }}
          className="w-44 [&_select]:py-2 [&_select]:text-[13px]"
        >
          <option value="">판매 상태 변경…</option>
          {/* 판매가 0원인 상품이 섞여 있어도 '판매중' 을 잠그지 않는다.
              예전에는 잠갔는데, 27개를 고르고 그중 1개가 0원이면 나머지 26개까지
              통째로 못 바꿨다 — 어떤 상품이 걸림돌인지도 알 수 없었다.
              서버(bulk-edit)는 행 단위로 멀쩡한 것만 바꾸고 0원짜리는 사유와 함께
              돌려주므로, 여기서는 막는 대신 아래 안내줄로 미리 알려 준다. */}
          {PRODUCT_STATUS_OPTIONS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>

        <Select
          aria-label="선택한 상품의 카테고리 이동"
          value=""
          disabled={busy}
          onChange={(e) => {
            if (e.target.value) onCategory(e.target.value === "none" ? null : e.target.value);
          }}
          className="w-44 [&_select]:py-2 [&_select]:text-[13px]"
        >
          <option value="">카테고리 이동…</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
          <option value="none">미분류로 되돌리기</option>
        </Select>

        <button
          type="button"
          onClick={onPriceAdjust}
          disabled={busy}
          className="inline-flex items-center gap-1.5 bg-forest-700 px-3.5 py-2 text-[13px] text-cream-50 transition-colors hover:bg-forest-800 disabled:opacity-50"
        >
          <Tag size={14} strokeWidth={1.5} />
          가격 일괄 조정…
        </button>

        <button
          type="button"
          onClick={() => onFeatured(true)}
          disabled={busy}
          className={`${BTN_GHOST} inline-flex items-center gap-1.5 px-3 py-2 text-[13px]`}
        >
          <Star size={14} strokeWidth={1.5} />
          추천 지정
        </button>
        <button
          type="button"
          onClick={() => onFeatured(false)}
          disabled={busy}
          className={`${BTN_GHOST} inline-flex items-center gap-1.5 px-3 py-2 text-[13px]`}
        >
          <StarOff size={14} strokeWidth={1.5} />
          추천 해제
        </button>

        {/* 되돌릴 수 없는 유일한 작업이라 다른 것들과 붙여 두지 않는다 —
            ml-auto 로 오른쪽 무리에 떼어 놓고, 채운 빨강 대신 테두리 빨강을 쓴다.
            채워 버리면 이 줄에서 가장 눈에 띄는 버튼이 '삭제' 가 되어, 카테고리를
            옮기러 온 사람의 손이 먼저 가는 자리에 놓인다. */}
        <button
          type="button"
          onClick={onDelete}
          disabled={busy}
          className="ml-auto inline-flex items-center gap-1.5 border border-signal-red/40 px-3 py-2 text-[13px] text-signal-red transition-colors hover:bg-signal-red hover:text-cream-50 disabled:opacity-50"
        >
          <Trash2 size={14} strokeWidth={1.5} />
          선택 삭제
        </button>

        <button
          type="button"
          onClick={onClear}
          disabled={busy}
          className="inline-flex items-center gap-1 px-2 py-2 text-[13px] text-ink-500 transition-colors hover:text-ink-900 disabled:opacity-50"
        >
          <X size={14} strokeWidth={1.5} />
          선택 해제
        </button>
      </div>

      {/* 안내는 선택지(option) 안이 아니라 밖에 적는다 — 176px 폭 셀렉트 안에 긴 문장을
          넣으면 브라우저가 말줄임 없이 잘라 버려 이유의 뒷부분이 통째로 사라진다. */}
      {zeroPriceCount > 0 && (
        <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs leading-relaxed text-signal-amber">
          <span>
            고른 상품 중 <span className="krw">{zeroPriceCount}</span>개는 판매가가 없어
            &lsquo;판매중&rsquo; 으로 바꿀 수 없습니다. 그 상품만 건너뛰고 나머지는 바뀝니다.
          </span>
          <button
            type="button"
            onClick={onDropZeroPrice}
            disabled={busy}
            className="border border-signal-amber/50 px-2 py-1 leading-none transition-colors hover:bg-signal-amber/10 disabled:opacity-50"
          >
            판매가 없는 상품만 선택 해제
          </button>
        </p>
      )}

      {busy && (
        <p className="mt-2 text-xs text-forest-700">바꾸는 중입니다. 잠시만 기다려 주세요…</p>
      )}
    </div>
  );
}
