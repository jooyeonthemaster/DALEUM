"use client";

/* ============================================================
   상품 폼이 띄우는 확인창 세 개.

   옛 폼은 삭제에만 확인창이 있었다 — 30분 작성한 내용을 날리는 '나가기' 에는 아무것도 없었다.
   위험한 순서대로 짚으면 (1) 저장 안 한 채 이탈, (2) 삭제 1단계, (3) 삭제 2단계다.

   삭제 1단계에 closeOnConfirm={false} 가 붙어 있는 이유는 반드시 읽어야 한다.
   ConfirmDialog 는 확인이 끝나면 스스로 onClose 를 부른다. 그런데 1단계의 확인은
   "닫기" 가 아니라 "2단계 열기" 라서, 자동으로 불린 onClose 가 단계를 곧바로 0으로
   되돌렸다 — 2단계 확인창은 한 프레임 떴다 사라지고 DELETE 요청은 나가지 않았다.
   화면에서는 '계속' 을 눌러도 아무 일도 일어나지 않는 것처럼 보였고, 그래서
   관리자 화면에서는 상품을 아예 지울 수 없었다. 이 창의 열림은 deleteStep 이 쥔다.
   ============================================================ */

import ConfirmDialog from "@/components/admin/ConfirmDialog";

export interface FormDialogsProps {
  /** 가로챈 이동 대상 (없으면 확인창을 닫아 둔다) */
  pendingHref: string | null;
  onCancelLeave: () => void;
  onConfirmLeave: () => void;
  deleteStep: 0 | 1 | 2;
  productName: string;
  onDeleteStep: (step: 0 | 1 | 2) => void;
  onDelete: () => void | Promise<void>;
}

export default function FormDialogs({
  pendingHref,
  onCancelLeave,
  onConfirmLeave,
  deleteStep,
  productName,
  onDeleteStep,
  onDelete,
}: FormDialogsProps) {
  return (
    <>
      <ConfirmDialog
        open={pendingHref !== null}
        onClose={onCancelLeave}
        onConfirm={onConfirmLeave}
        title="저장하지 않고 나갈까요?"
        description={
          "아직 저장하지 않은 변경 사항이 있습니다.\n작성 중이던 내용은 이 브라우저에 임시로 남겨 두므로, 다시 들어오면 이어서 쓸 수 있습니다."
        }
        confirmLabel="나가기"
        danger
      />

      <ConfirmDialog
        open={deleteStep === 1}
        onClose={() => onDeleteStep(0)}
        onConfirm={() => onDeleteStep(2)}
        closeOnConfirm={false}
        title="상품 삭제"
        description={`'${productName}' 상품을 삭제하시겠습니까?\n스토어에서 잠시 내리려면 삭제 대신 상태를 '숨김'으로 변경하는 것을 권장합니다.`}
        confirmLabel="계속"
      />

      <ConfirmDialog
        open={deleteStep === 2}
        onClose={() => onDeleteStep(0)}
        onConfirm={onDelete}
        title="정말 삭제할까요?"
        description="삭제한 상품과 이미지·옵션·재고 이력은 복구할 수 없습니다. 계속하시겠습니까?"
        confirmLabel="영구 삭제"
        danger
      />
    </>
  );
}
