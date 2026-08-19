/* ============================================================
   재고 화면 숫자 입력 해석

   왜 별도로 두는가:
   관리자는 수량을 한국식으로 '1,000' 이라고 적는다. Number("1,000") 은 NaN 이라
   그대로 쓰면 "저장은 됐다는데 재고가 0" 같은 사고가 난다.
   쉼표·공백·'개'·'원' 을 걷어낸 뒤 정수만 통과시키고, 아니면 null 을 돌려
   호출부가 반드시 오류로 처리하게 만든다. 조용한 0 대체는 절대 하지 않는다.
   ============================================================ */

/** 정수로 읽히면 그 값, 아니면 null (빈 칸도 null) */
export function parseCount(raw: string): number | null {
  const t = raw.replace(/[,\s 　개원]/g, "");
  if (!t || t === "-") return null;
  if (!/^[+-]?\d+$/.test(t)) return null;
  const n = Number.parseInt(t, 10);
  return Number.isSafeInteger(n) ? n : null;
}
