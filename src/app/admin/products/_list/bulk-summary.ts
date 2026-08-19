/* ============================================================
   일괄 편집 결과를 사람 말로 옮긴다.

   "성공했습니다" 한 줄만 띄우면 27개 중 3개가 실패해도 아무도 모른다.
   그래서 서버가 돌려준 성공/건너뜀/실패를 전부 문장으로 풀어 놓는다.
   실패한 상품은 이름과 이유를 함께 적어야 관리자가 무엇을 고쳐야 할지 안다.
   ============================================================ */

import { krw } from "@/lib/format";
import type { BulkEditResult } from "./list-types";

/**
 * 뒤에 붙는 조사 '로 / 으로' 를 고른다.
 *
 * 결과 안내가 "'판매중'로 바꿨습니다" 처럼 나오고 있었다. 상태 라벨 4개 중
 * 받침이 있는 셋('임시 저장' · '판매중' · '숨김')에서 전부 틀렸다.
 * 한국어 규칙은 하나뿐이다 — 받침이 없거나 받침이 'ㄹ' 이면 '로', 그 밖에는 '으로'.
 * (그래서 '품절'은 '품절로' 가 맞고 '판매중'은 '판매중으로' 가 맞다.)
 * 카테고리 이름처럼 관리자가 직접 지은 말에도 그대로 적용된다.
 */
export function josaRo(word: string): string {
  const last = word.trim().slice(-1);
  const code = last.charCodeAt(0) - 0xac00;
  // 한글 음절이 아니면(영문·숫자로 끝나는 이름) 읽기를 확신할 수 없으므로 '(으)로' 로 둔다
  if (code < 0 || code > 11171) return "(으)로";
  const jong = code % 28;
  return jong === 0 || jong === 8 ? "로" : "으로";
}

/**
 * @param verb 결과 첫 문장의 서술어. 삭제는 "바꿨습니다" 가 아니라 "삭제했습니다" 여야 한다 —
 *             27개를 지워 놓고 "바꿨습니다" 라고 적으면 무슨 일이 일어난 건지 알 수 없다.
 */
export function summarizeBulkResult(
  headline: string,
  result: BulkEditResult,
  verb = "바꿨습니다"
): string {
  const parts = [`${headline} — 상품 ${result.ok}개를 ${verb}.`];

  if (result.changes.length > 0) {
    const sample = result.changes
      .slice(0, 2)
      .map((c) => `${c.name} ${krw(c.before ?? 0)}원 → ${krw(c.after ?? 0)}원`)
      .join(", ");
    const more = result.changes.length > 2 ? ` 외 ${result.changes.length - 2}건` : "";
    parts.push(`예: ${sample}${more}.`);
  }
  if (result.skipped.length > 0) {
    /* 이유별로 묶어 센다.
       예전에는 "N개는 바뀔 값이 없어 건너뛰었습니다" 한 문장으로 뭉쳐 놨는데, 그 문구는
       가격 조정에서만 맞다 — 삭제에서 건너뛰는 이유는 '이미 지워져 있었다' 이고, 가격
       조정 안에서도 '기준값이 비어 있다' 와 '바뀌는 값이 없다' 는 관리자가 해야 할 일이
       서로 다르다. 서버가 준 이유를 그대로 살려 세어 준다. */
    const byReason = new Map<string, number>();
    for (const item of result.skipped) {
      byReason.set(item.reason, (byReason.get(item.reason) ?? 0) + 1);
    }
    parts.push([...byReason].map(([reason, n]) => `${n}개는 ${reason}`).join(" "));
  }
  if (result.failed.length > 0) {
    const sample = result.failed
      .slice(0, 3)
      .map((f) => `${f.name} — ${f.reason}`)
      .join(" / ");
    const more = result.failed.length > 3 ? ` 외 ${result.failed.length - 3}개` : "";
    parts.push(`실패 ${result.failed.length}개: ${sample}${more}`);
  }
  return parts.join(" ");
}
