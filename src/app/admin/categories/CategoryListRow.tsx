"use client";

/* ============================================================
   카테고리 목록 한 줄.

   여기서 바로잡은 것:
   · 영문 주소(/ramen)를 이름 옆에 상시 찍던 것을 없앴다. 비개발자에게는 뜻을 알 수 없는
     문자열이었고, 이름('소스포함 곤약면')과 주소(ramen)가 어긋나 있어 "틀린 걸 고쳐야 하나"
     싶게 만들었다. 주소는 수정 창의 고급 설정 안에서만 보인다.
   · 그 자리에 '스토어에서 보기' 를 넣었다. 바꾼 결과를 확인하려고 주소를 손으로 치던 일을 없앤다.
   · 모바일에서 사라지던 상품 수·노출 상태·사진을 전부 되살렸다. 확인할 수 없는 채로
     토글만 만질 수 있는 상태가 가장 위험하다.
   · 상품 수를 '고객에게 보이는 상품 n개 · 전체 상품 m개' 두 값으로 나눴다. 한 값만 보고
     "충분하다" 고 판단했다가 고객 화면은 0개인 일이 실제로 있다. 처음에는 '고객 화면 n개'
     라고만 적었는데 무엇의 개수인지 화면 어디에도 없었다(뜻풀이가 마우스 툴팁에만 있어
     터치 화면에서는 볼 수가 없었다) — 낱말을 문장에 넣어 두었다.
   · 홈 관련 뱃지와 대체 사진은 목록 자리(index)가 아니라 **홈 자리**(homeIndex)로 판단한다.
     홈에는 노출 카테고리만 내려가므로 중간에 숨긴 행이 있으면 두 자리가 어긋난다.
   ============================================================ */

import Image from "next/image";
import { ChevronDown, ChevronUp, ExternalLink, GripVertical } from "lucide-react";
import { Toggle } from "@/components/admin/Field";
import { TOGGLE_LABELS } from "@/lib/admin-labels";
import { storePath } from "./category-address";
import { countTooltip, homeFallbackImage, isBelowHomeFold, type CategoryRow } from "./category-types";

export interface CategoryListRowProps {
  row: CategoryRow;
  index: number;
  /** 홈 화면에서 몇 번째 타일이 되는가 — 숨긴 카테고리는 홈에 안 나오므로 null */
  homeIndex: number | null;
  total: number;
  busy: boolean;
  onMove: (dir: -1 | 1) => void;
  onToggle: (next: boolean) => void;
  onEdit: () => void;
  dragging: boolean;
  dropTarget: boolean;
  dragHandlers: {
    onDragStart: () => void;
    onDragOver: (e: React.DragEvent) => void;
    onDrop: () => void;
    onDragEnd: () => void;
  };
}

function Chip({ tone, children }: { tone: "forest" | "amber" | "mute"; children: React.ReactNode }) {
  const toneClass =
    tone === "forest"
      ? "border-forest-200 bg-forest-50 text-forest-700"
      : tone === "amber"
        ? "border-[#e8d6ae] bg-[#fbf3e2] text-signal-amber"
        : "border-ink-200 bg-cream-100 text-ink-500";
  return (
    <span className={`shrink-0 border px-1.5 py-0.5 text-[11px] leading-tight ${toneClass}`}>
      {children}
    </span>
  );
}

export default function CategoryListRow({
  row,
  index,
  homeIndex,
  total,
  busy,
  onMove,
  onToggle,
  onEdit,
  dragging,
  dropTarget,
  dragHandlers,
}: CategoryListRowProps) {
  // 숨긴 카테고리인데 소속 상품이 고객에게 계속 팔리는 상태 — 가장 오해가 잦은 조합이다
  const hiddenButSelling = !row.is_active && row.visible_count > 0;
  // 상품은 있는데 고객 화면에는 하나도 안 보이는 상태(전부 임시저장·숨김)
  const emptyToCustomer = row.is_active && row.visible_count === 0 && row.product_count > 0;

  return (
    <li
      onDragOver={dragHandlers.onDragOver}
      onDrop={dragHandlers.onDrop}
      className={`flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-3 transition-colors sm:flex-nowrap sm:px-4 ${
        dragging ? "opacity-40" : ""
      } ${dropTarget ? "border-t-2 border-t-forest-700" : ""} ${
        row.is_active ? "" : "border-l-2 border-l-ink-300 bg-cream-100"
      }`}
    >
      {/* 순서 조작 — 끌기는 손잡이만, 화살표는 손가락으로도 누를 수 있게 크게 */}
      <div className="flex shrink-0 flex-col items-center">
        <button
          type="button"
          onClick={() => onMove(-1)}
          disabled={index === 0 || busy}
          aria-label={`${row.name} 위로 옮기기`}
          className="flex h-11 w-11 items-center justify-center text-ink-400 transition-colors hover:text-forest-700 disabled:opacity-25 sm:h-7 sm:w-7"
        >
          <ChevronUp size={18} strokeWidth={1.5} />
        </button>
        <span
          draggable={!busy}
          onDragStart={dragHandlers.onDragStart}
          onDragEnd={dragHandlers.onDragEnd}
          aria-hidden
          title="끌어서 순서 바꾸기"
          className="hidden cursor-grab py-0.5 text-ink-300 hover:text-ink-500 sm:block"
        >
          <GripVertical size={15} strokeWidth={1.5} />
        </span>
        <button
          type="button"
          onClick={() => onMove(1)}
          disabled={index === total - 1 || busy}
          aria-label={`${row.name} 아래로 옮기기`}
          className="flex h-11 w-11 items-center justify-center text-ink-400 transition-colors hover:text-forest-700 disabled:opacity-25 sm:h-7 sm:w-7"
        >
          <ChevronDown size={18} strokeWidth={1.5} />
        </button>
      </div>

      {/* 사진 — 비어 있으면 홈이 실제로 걸어 줄 사진을 흐리게 보여 준다.
          대체 사진은 홈 자리로 정해지므로(FALLBACK_IMAGES[i % 8]) homeIndex 를 쓴다. */}
      <div className="relative h-10 w-10 shrink-0 overflow-hidden border border-ink-200 bg-cream-100">
        <Image
          src={row.image_url ?? homeFallbackImage(homeIndex ?? index)}
          alt=""
          fill
          sizes="40px"
          className={`object-cover ${row.image_url ? "" : "opacity-40 grayscale"}`}
        />
        {!row.image_url && (
          <span className="absolute inset-0 flex items-center justify-center text-[9px] leading-none text-ink-500">
            기본
          </span>
        )}
      </div>

      {/* 이름 · 상태 · 상품 수 */}
      <div className="min-w-0 flex-1 basis-40">
        <div className="flex flex-wrap items-center gap-1.5">
          <p
            className={`truncate font-medium ${row.is_active ? "text-ink-900" : "text-ink-500"}`}
          >
            {row.name}
          </p>
          {!row.is_active && <Chip tone="mute">숨김 — 고객 화면에 탭 없음</Chip>}
          {homeIndex === 0 && <Chip tone="forest">홈 대표 타일</Chip>}
          {homeIndex !== null && isBelowHomeFold(homeIndex) && (
            <Chip tone="mute">홈에 안 나옴 (앞에서 8개까지)</Chip>
          )}
          {hiddenButSelling && <Chip tone="amber">숨김인데 상품 {row.visible_count}개 판매중</Chip>}
        </div>

        {/* '고객 화면 1개 · 전체 6개' 는 무엇의 개수인지 화면에 없었다. 뜻풀이가 마우스 툴팁에만
            있어서 손가락으로 쓰는 화면에서는 확인할 방법이 아예 없다 — 낱말을 문장에 넣는다. */}
        <p className="mt-0.5 text-xs text-ink-500" title={countTooltip(row)}>
          <span className={emptyToCustomer ? "text-signal-amber" : ""}>
            고객에게 보이는 상품 <span className="krw">{row.visible_count}</span>개
          </span>
          <span className="text-ink-300"> · </span>
          전체 상품 <span className="krw">{row.product_count}</span>개
          {emptyToCustomer && (
            <span className="text-signal-amber"> — 고객에게는 비어 보입니다</span>
          )}
        </p>

        {row.description && (
          <p className="mt-0.5 hidden truncate text-xs text-ink-400 sm:block">{row.description}</p>
        )}
      </div>

      {/* 노출 토글 · 스토어 열기 · 수정 */}
      <div className="ml-auto flex shrink-0 items-center gap-1">
        <Toggle
          checked={row.is_active}
          onChange={onToggle}
          disabled={busy}
          label={row.is_active ? TOGGLE_LABELS.on : TOGGLE_LABELS.off}
          className="min-h-11 px-1 sm:min-h-0"
        />
        <a
          href={storePath(row.slug)}
          target="_blank"
          rel="noreferrer"
          title="고객 화면에서 이 카테고리 열기"
          className="flex h-11 w-11 items-center justify-center text-ink-400 transition-colors hover:text-forest-700 sm:h-9 sm:w-9"
        >
          <ExternalLink size={16} strokeWidth={1.5} />
          <span className="sr-only">{row.name} 스토어에서 보기</span>
        </a>
        <button
          type="button"
          onClick={onEdit}
          className="border border-ink-200 px-3 py-2.5 text-xs text-ink-600 transition-colors hover:bg-cream-100"
        >
          수정
        </button>
      </div>
    </li>
  );
}
