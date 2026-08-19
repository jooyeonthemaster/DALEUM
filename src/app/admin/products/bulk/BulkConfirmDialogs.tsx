"use client";

/* ============================================================
   확인 대화상자 둘 — 등록 직전 · 엑셀로 덮어쓰기 직전

   화면 파일에서 떼어 냈다(한 파일 400줄에서 분할).

   둘 다 앱 공용 ConfirmDialog 를 쓴다. 예전에는 등록 확인이 브라우저 기본
   window.confirm 이었는데, 관리자 화면과 생김새가 달라 피싱이나 오류 팝업처럼 보여
   반사적으로 취소를 누르게 했다.

   문구에 **무엇이 어떤 상태로 들어가는지**를 상품 이름과 함께 적는다.
   "30개 상품을 등록할까요?" 만으로는 판매중으로 열리는지 임시 저장인지 알 수 없다.
   ============================================================ */

import ConfirmDialog from "@/components/admin/ConfirmDialog";
import type { ProductDraft } from "./bulk-types";

export interface BulkConfirmDialogsProps {
  /** 등록 대상 — 이미 등록이 끝난 카드는 빠져 있다 */
  pending: ProductDraft[];
  confirmCreate: boolean;
  onCloseCreate: () => void;
  onConfirmCreate: () => void;
  /** 엑셀 덮어쓰기를 기다리는 중인가 */
  importPending: boolean;
  onCloseImport: () => void;
  onConfirmImport: () => void;
  /** 덮어쓰면 사라지는 것들 — 숫자로 보여 줘야 무게가 전달된다 */
  draftCount: number;
  imageTotal: number;
}

export default function BulkConfirmDialogs({
  pending,
  confirmCreate,
  onCloseCreate,
  onConfirmCreate,
  importPending,
  onCloseImport,
  onConfirmImport,
  draftCount,
  imageTotal,
}: BulkConfirmDialogsProps) {
  const leadName = pending[0]?.name.trim() || "이름 없는 상품";
  // 이 창은 검증을 통과한 뒤에만 열린다(BulkProductImportClient.requestCreate).
  // 그러므로 여기 적히는 수는 **확정값**이다 — "판매중 또는 임시 저장" 같은 두루뭉술한 말을
  // 쓰면 대표는 몇 개가 고객에게 바로 보이는지 모른 채 확인을 누르게 된다.
  const activeCount = pending.filter((d) => d.status === "active").length;
  const draftOnlyCount = pending.length - activeCount;
  const stateText = [
    activeCount > 0 ? `판매중 ${activeCount}개` : "",
    draftOnlyCount > 0 ? `임시 저장 ${draftOnlyCount}개` : "",
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      <ConfirmDialog
        open={confirmCreate}
        onClose={onCloseCreate}
        onConfirm={onConfirmCreate}
        title="상품을 등록할까요?"
        confirmLabel={`${pending.length}개 등록`}
        description={
          pending.length === 0
            ? "등록할 상품이 없습니다."
            : `'${leadName}'${pending.length > 1 ? ` 외 ${pending.length - 1}개` : ""}를 등록합니다.\n${stateText}${
                activeCount > 0 ? " — 판매중인 상품은 곧바로 고객에게 보입니다." : ""
              }\n등록한 뒤에도 상품 관리에서 언제든 고칠 수 있습니다.`
        }
      />

      <ConfirmDialog
        open={importPending}
        onClose={onCloseImport}
        onConfirm={onConfirmImport}
        danger
        title="작성 중인 내용을 덮어쓸까요?"
        confirmLabel="덮어쓰고 불러오기"
        description={`지금 작성 중인 상품 ${draftCount}개(사진 ${imageTotal}장)가 사라지고 엑셀 내용으로 바뀝니다.\n되돌릴 수 없습니다.`}
      />
    </>
  );
}
