/* ============================================================
   일괄 작업 확인 문구.

   왜 확인을 받나:
   행 하나의 상태를 '판매중' 으로 올릴 때는 확인 대화상자가 있었는데, 정작 더 위험한
   **N개를 한꺼번에 바꾸는 길**은 드롭다운을 고르는 순간 곧바로 실행됐다.
   목록에서 20개를 고른 채 상태 셀렉트를 잘못 스치기만 해도 임시저장 상품 20개가
   고객 스토어에 즉시 떴고, 되돌리는 방법은 다시 20개를 골라 원래 상태로 바꾸는 것뿐이었다
   (그 사이 주문이 들어오면 되돌릴 수도 없다).

   문구를 화면(ProductsClient)에서 만들지 않고 여기 모은 이유는, 같은 말을 확인 대화상자와
   결과 안내 두 곳에서 써야 하고 조사('로/으로')까지 맞춰야 하기 때문이다.
   ============================================================ */

import type { Category } from "@/lib/types";
import { PRODUCT_STATUS_LABELS } from "../product-ui";
import { josaRo } from "./bulk-summary";
import { describePlan } from "./price-math";
import type { BulkAction, ProductListRow } from "./list-types";

export interface BulkConfirmCopy {
  /** 확인 대화상자 제목 */
  title: string;
  /** 확인 대화상자 본문 */
  description: string;
  /** 확인 버튼 글자 */
  confirmLabel: string;
  /** 실행 뒤 결과 안내의 첫 문장 */
  headline: string;
}

/** 무엇을 바꾸는지 관리자가 알아볼 수 있게 상품명 몇 개를 실어 준다 */
function sampleNames(rows: ProductListRow[]): string {
  const shown = rows.slice(0, 3).map((r) => r.name);
  const more = rows.length - shown.length;
  return `${shown.join(" · ")}${more > 0 ? ` 외 ${more}개` : ""}`;
}

export function buildBulkConfirm(
  action: BulkAction,
  rows: ProductListRow[],
  categories: Category[]
): BulkConfirmCopy {
  const count = rows.length;
  const names = sampleNames(rows);

  if (action.kind === "status") {
    const label = PRODUCT_STATUS_LABELS[action.value];
    // 상태마다 고객이 겪는 결과가 다르다 — "즉시 반영됩니다" 한 문장으로 뭉뚱그리면
    // 숨김으로 내리는 사람이 무엇을 잃는지 모른 채 확인을 누른다
    const effect =
      action.value === "active"
        ? "고객 스토어에 즉시 나타나고 바로 주문을 받게 됩니다."
        : action.value === "sold_out"
          ? "고객 스토어에 계속 보이지만 주문은 받지 않습니다."
          : action.value === "hidden"
            ? "고객 스토어에서 즉시 사라집니다. 검색과 카테고리에서도 빠집니다."
            : "고객 스토어에서 즉시 사라집니다. 다시 '판매중' 으로 올려야 팔 수 있습니다.";
    return {
      title: `상품 ${count}개의 판매 상태를 바꿉니다`,
      description: `${names}\n\n이 ${count}개를 '${label}'${josaRo(label)} 바꿉니다. ${effect}\n계속할까요?`,
      confirmLabel: `${label}${josaRo(label)} 바꾸기`,
      headline: `판매 상태 → ${label}`,
    };
  }

  if (action.kind === "category") {
    const name =
      action.value === null
        ? null
        : (categories.find((c) => c.id === action.value)?.name ?? "고른 분류");
    const where = name === null ? "미분류" : name;
    return {
      title: `상품 ${count}개의 카테고리를 옮깁니다`,
      description: `${names}\n\n이 ${count}개를 '${where}'${josaRo(where)} 옮깁니다. 고객 스토어의 카테고리 목록에 즉시 반영됩니다.\n계속할까요?`,
      confirmLabel: "옮기기",
      headline: name === null ? "카테고리 → 미분류" : `카테고리 → ${name}`,
    };
  }

  if (action.kind === "delete") {
    /* 삭제만은 "무엇이 함께 사라지는가" 와 "무엇은 안 지워지는가" 를 둘 다 적는다.
       상품만 지워지는 줄 알고 눌렀다가 사진·옵션·재고 이력까지 잃는 일이 없어야 하고,
       주문 이력이 있어 남는 상품을 미리 말해 두지 않으면 결과 안내의 '실패 2개' 가
       버그처럼 읽힌다. */
    return {
      title: `상품 ${count}개를 영구 삭제합니다`,
      description: `${names}

이 ${count}개를 지웁니다. 사진 · 옵션 · 재고 이력이 함께 사라지고 되돌릴 수 없습니다.
주문 이력이 있는 상품은 지워지지 않고 그대로 남습니다 — 스토어에서 내리려면 삭제 대신 상태를 '숨김' 으로 바꿔 주세요.
계속할까요?`,
      confirmLabel: `${count}개 영구 삭제`,
      headline: "선택 삭제",
    };
  }

  if (action.kind === "featured") {
    return {
      title: action.value
        ? `상품 ${count}개를 추천 상품으로 지정합니다`
        : `상품 ${count}개의 추천 지정을 해제합니다`,
      description: `${names}\n\n${
        action.value ? "추천 상품은 첫 화면에 함께 노출됩니다." : "첫 화면 추천 자리에서 빠집니다."
      }\n계속할까요?`,
      confirmLabel: action.value ? "추천 지정" : "추천 해제",
      headline: action.value ? "추천 상품으로 지정" : "추천 지정 해제",
    };
  }

  // 가격은 이미 미리보기 대화상자에서 바뀔 값 전부를 보고 확인을 받았다 —
  // 확인을 두 번 받으면 오히려 미리보기를 안 읽고 넘기게 된다.
  return {
    title: "",
    description: "",
    confirmLabel: "",
    headline: describePlan(action.plan, { done: true }),
  };
}
