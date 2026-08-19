"use client";

/* ============================================================
   세로로 아주 긴 사진 경고.

   과거에 상세페이지 통이미지(1600 × 18,700~24,800px)가 상품 사진 두 번째 칸에
   그대로 들어가, 고객 화면 썸네일이 세로 2만 px 짜리 띠가 된 사고가 있었다
   (scripts/fix_tall_gallery_images.mjs 가 그 뒷수습 스크립트다).

   그래서 막는 게 아니라 **묻는다.** 판정 기준은 세로비 하나뿐이라
   드물게 정상적인 세로 상품컷도 걸릴 수 있고, 그때 올릴 길이 아예 없으면
   관리자는 다시 개발자를 부르게 된다. 권하는 쪽은 상세페이지행이다.
   ============================================================ */

import { AlertTriangle } from "lucide-react";

export interface TallImageNoticeProps {
  /** 파일명과 크기를 사람이 읽는 한 줄로 만든 목록 */
  labels: string[];
  /** 상세페이지 쪽으로 넘길 수단이 있을 때만 버튼이 생긴다 */
  onSendToDetail?: () => void;
  onUploadAnyway: () => void;
  onDismiss: () => void;
}

export default function TallImageNotice({
  labels,
  onSendToDetail,
  onUploadAnyway,
  onDismiss,
}: TallImageNoticeProps) {
  return (
    <div className="mt-3 border border-signal-amber/40 bg-signal-amber/5 p-3.5">
      <p className="flex items-center gap-1.5 text-sm font-medium text-ink-900">
        <AlertTriangle size={15} strokeWidth={1.5} className="shrink-0 text-signal-amber" />
        세로로 아주 긴 사진이 <span className="krw">{labels.length}</span>장 있습니다
      </p>
      <p className="mt-1.5 text-xs leading-relaxed text-ink-600">
        이건 상품 사진이 아니라 상세페이지용 이미지 같습니다. 상품 사진으로 넣으면 고객 화면의
        작은 썸네일이 알아볼 수 없는 세로 띠가 됩니다. 상세페이지 탭에 넣어 주세요.
      </p>
      <ul className="mt-2 space-y-0.5">
        {labels.map((label) => (
          <li key={label} className="truncate text-xs text-ink-500">
            {label}
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {onSendToDetail && (
          <button
            type="button"
            onClick={onSendToDetail}
            className="bg-forest-700 px-3.5 py-2 text-xs text-cream-50 transition-colors hover:bg-forest-800"
          >
            상세페이지 탭으로 보내기
          </button>
        )}
        <button
          type="button"
          onClick={onUploadAnyway}
          className="border border-ink-200 px-3.5 py-2 text-xs text-ink-600 transition-colors hover:bg-cream-100"
        >
          그래도 상품 사진으로 추가
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="px-2 py-2 text-xs text-ink-400 transition-colors hover:text-ink-700"
        >
          그만두기
        </button>
      </div>
    </div>
  );
}
