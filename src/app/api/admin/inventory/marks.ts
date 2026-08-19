/* ============================================================
   입출고 이력 메모에 숨겨 두는 처리 표식

   왜 필요한가:
   재고 증감은 절대값이 아니라 증감이라 같은 요청을 두 번 실행하면 그대로 두 번 들어간다.
   실제로 두 자리에서 그 일이 났다.
     · 엑셀 일괄 반영이 응답을 못 받고 실패처럼 보이면 관리자가 다시 누른다 → 같은 수량 이중 입고
     · 입출고 이력의 '되돌리기' 는 몇 번이고 눌린다 → 한 번 되돌린 것이 두 번 빠진다
   막으려면 "이 처리를 이미 했는가" 를 저장해 둬야 하는데, 재고 이력(daleum.inventory_logs)이
   이미 모든 처리를 한 줄씩 남기고 있다. 별도 표를 새로 만들지 않고 그 메모에 표식을 심어
   같은 표식이 이미 있으면 두 번째 실행을 거절한다.

   화면에는 절대 보이면 안 된다:
   표식은 사람이 읽을 말이 아니다(관리자 화면에 코드가 보이면 안 된다는 절대 규칙).
   메모를 화면·엑셀에 내보낼 때는 반드시 stripMarks() 를 거쳐 표식을 지우고 보여 준다.

   서버(api)와 화면(admin) 양쪽이 같은 글자를 써야 하므로 이 파일 하나에만 형식을 둔다.
   ============================================================ */

/**
 * 표식을 감싸는 괄호.
 * 관리자가 메모에 손으로 칠 일이 없는 글자여야 원래 메모를 잘못 지우지 않는다.
 * 또 ilike 검색에 쓰므로 % _ 처럼 패턴 문자로 해석되는 글자는 쓰지 않는다.
 */
const OPEN = "⟪";
const CLOSE = "⟫";

/** 표식 하나를 통째로 집어내는 식 — 앞뒤 공백까지 함께 지워 메모가 지저분해지지 않게 한다 */
const MARK_RE = /\s*⟪[^⟫]*⟫\s*/g;

/** 엑셀 일괄 반영 한 묶음을 가리키는 표식 */
export function batchMark(batchId: string): string {
  return `${OPEN}일괄:${batchId}${CLOSE}`;
}

/** 어떤 이력을 되돌려 생긴 줄인지 가리키는 표식 */
export function undoMark(logId: number): string {
  return `${OPEN}되돌림:${logId}${CLOSE}`;
}

/** 메모 뒤에 표식을 붙인다 (메모가 없으면 표식만 남는다) */
export function withMark(memo: string | null, mark: string): string {
  const base = (memo ?? "").trim();
  return base ? `${base} ${mark}` : mark;
}

/** 사람에게 보여 줄 메모 — 표식을 지운다. 표식만 있던 줄은 빈 값이 되므로 null 로 돌린다 */
export function stripMarks(memo: string | null): string | null {
  if (!memo) return null;
  const cleaned = memo.replace(MARK_RE, " ").trim();
  return cleaned || null;
}

/** 이력 메모에서 이 표식을 찾는 ilike 패턴 */
export function markPattern(mark: string): string {
  return `%${mark}%`;
}

/** '되돌림' 표식이 달린 줄만 훑어 오는 ilike 패턴 */
export function undoScanPattern(): string {
  return `%${OPEN}되돌림:%`;
}

/** '되돌림' 표식이 달린 메모들에서 원본 이력 번호만 뽑아낸다 */
export function parseUndoneLogIds(memos: (string | null)[]): Set<number> {
  const found = new Set<number>();
  const re = new RegExp(`${OPEN}되돌림:(\\d+)${CLOSE}`, "g");
  for (const memo of memos) {
    if (!memo) continue;
    for (const m of memo.matchAll(re)) {
      const id = Number.parseInt(m[1], 10);
      if (Number.isSafeInteger(id)) found.add(id);
    }
  }
  return found;
}

/**
 * 클라이언트가 만들어 보낸 처리 식별자가 쓸 만한 값인지.
 * 표식은 ilike 로 되찾으므로 패턴 문자(% _)나 괄호가 섞이면 엉뚱한 줄을 이미 처리한 것으로 볼 수 있다.
 * randomUUID() 가 내는 글자만 통과시킨다.
 */
export function isSafeBatchId(v: unknown): v is string {
  return typeof v === "string" && /^[0-9a-fA-F-]{8,64}$/.test(v);
}
