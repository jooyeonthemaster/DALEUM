"use client";

/* ============================================================
   화면 아래 고정 저장 바.

   고친 것:
   - 옛 바는 불투명한 배경으로 본문 위에 떠 있는데 탭 내용에 아래 여백이 없어서, 마지막 입력 줄
     ('재고 임계치' 행)이 바에 잘려 절반만 보였다. 아래 여백은 각 탭 래퍼가 책임지고,
     여기서는 겹치는 경계가 눈에 보이도록 위쪽 그림자를 넣는다.
   - 좌측 사이드바 아바타가 모바일에서 '취소' 버튼을 덮었다. 사이드바 쪽은 이 유닛 파일이
     아니라 손대지 않고, 저장 바를 그보다 위(z-30)로 올려 최소한 버튼은 눌리게 한다.
   - 등록 버튼만 있고 '지금 상태로 등록하면 고객에게 보이는지' 를 아무도 말해 주지 않았다.
   ============================================================ */

import Link from "next/link";
import { Help } from "@/components/admin/Field";
import { BTN_GHOST, BTN_PRIMARY } from "../product-ui";

export interface SaveBarProps {
  isNew: boolean;
  saving: boolean;
  /** 편집 모드에서만 — 주문 이력이 있으면 삭제 불가 */
  canDelete: boolean;
  hasOrders: boolean;
  onDelete: () => void;
  onSave: () => void;
  /** 저장하지 않은 변경이 있는지 — 저장 버튼 옆 상태 표시에 쓴다 */
  dirty: boolean;
  /** 마지막으로 초안을 브라우저에 남긴 시각 */
  draftSavedAt: number | null;
  /** 지금 상태로 저장하면 고객에게 보이지 않는지(임시 저장·숨김) */
  hiddenFromCustomers: boolean;
  /**
   * 저장을 막고 있는 문제 개수.
   * 오류 목록은 화면 맨 위에 뜨는데 저장 버튼은 맨 아래에 있어서, 긴 폼을 스크롤한 채
   * 저장을 누르면 '아무 일도 안 일어난' 것처럼 보였다 — 버튼 바로 옆에서도 말해 준다.
   */
  issueCount: number;
}

/** 14:22 */
function hhmm(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function SaveBar({
  isNew,
  saving,
  canDelete,
  hasOrders,
  onDelete,
  onSave,
  dirty,
  draftSavedAt,
  hiddenFromCustomers,
  issueCount,
}: SaveBarProps) {
  return (
    <div className="sticky bottom-0 z-30 mt-10 flex flex-col gap-3 border-t border-ink-200 bg-cream-50 py-4 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        {canDelete && (
          <>
            <button
              type="button"
              onClick={onDelete}
              disabled={hasOrders || saving}
              className="text-sm text-ink-400 transition-colors hover:text-signal-red disabled:cursor-not-allowed disabled:opacity-50"
            >
              상품 삭제
            </button>
            {hasOrders && (
              <Help>주문 이력이 있어 삭제할 수 없습니다. 상태를 숨김으로 변경해 주세요.</Help>
            )}
          </>
        )}
        {draftSavedAt !== null && (
          // '저장했다' 로 오해하지 않도록 어디에 담겼는지까지 밝힌다 — 서버에는 아직 아무것도 안 갔다.
          <p className="text-xs text-ink-400">
            작성 중인 내용을 {hhmm(draftSavedAt)}에 이 브라우저에 임시로 담아 두었습니다.
          </p>
        )}
      </div>

      <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
        {issueCount > 0 ? (
          <span className="text-xs text-signal-red sm:mr-1 sm:text-right">
            고쳐야 할 곳 <span className="krw">{issueCount}</span>군데 — 화면 위쪽에 목록이 있습니다.
          </span>
        ) : hiddenFromCustomers ? (
          <span className="text-xs text-signal-amber sm:mr-1 sm:text-right">
            지금 상태로는 고객 화면에 보이지 않습니다.
          </span>
        ) : (
          dirty && (
            <span className="text-xs text-ink-400 sm:mr-1 sm:text-right">
              저장하지 않은 변경이 있습니다.
            </span>
          )
        )}
        {/* 모바일에서 두 버튼이 같은 폭으로 나란히 서도록 — 한 줄에 몰아 두면 아바타에 눌린다 */}
        <div className="flex items-center gap-2">
          <Link href="/admin/products" className={`${BTN_GHOST} flex-1 text-center sm:flex-none`}>
            취소
          </Link>
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className={`${BTN_PRIMARY} flex-1 sm:flex-none`}
          >
            {saving ? "저장 중…" : isNew ? "상품 등록" : "변경 사항 저장"}
          </button>
        </div>
      </div>
    </div>
  );
}
