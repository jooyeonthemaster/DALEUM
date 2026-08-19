/* ============================================================
   업소용·OEM 문의 — 처리 이력 저장 규칙

   왜 이런 방식인가:
   견적 문의는 "받았다" 로 끝나지 않는다. 전화했는지, 단가표를 보냈는지,
   보냈다면 언제 무엇을 보냈는지가 남아야 며칠 뒤 거래처가 "견적 못 받았다" 고 할 때
   대답할 수 있다. 그런데 이 저장소에는 답변을 담을 테이블(bulk_inquiry_replies 같은 것)이
   없고, 메일을 대신 보내줄 발송 수단도 없다(package.json 에 메일 라이브러리가 하나도 없다).
   테이블을 새로 지어내면 운영 DB 에 없는 테이블을 호출하는 화면이 되어 그 자리에서 깨진다.

   그래서 이미 있는 bulk_inquiries.admin_memo(text) 한 칸에 이력을 쌓는다.
   주문 화면이 orders.admin_memo 에 운영 메모를 한 줄씩 덧붙이는 방식(lib/orders.ts)과
   같은 결이다. 다만 거기보다 규칙을 조금 더 세워, 화면이 이력을 시간순 카드로
   되읽을 수 있게 한다.

   저장 형태(사람이 그대로 읽어도 말이 되는 한국어여야 한다 — 화면에 코드가 보이면 안 되므로
   JSON 이나 키:값 같은 구조화 문자열은 쓰지 않는다):

     담당자가 자유롭게 적은 메모가 맨 위에 온다.
     [2026.08.19 14:32] 견적 발송 · 김대표
     10입 기준 단가표를 메일로 보냈습니다.
     [2026.08.19 15:10] 상태 변경 · 김대표
     신규 접수 → 견적 발송

   앞부분(첫 이력 줄이 나오기 전까지)은 자유 메모, 그 뒤는 덧붙이기만 하는 이력이다.
   기존에 저장돼 있던 자유입력 메모는 이력 줄이 없으므로 전부 자유 메모로 읽힌다.
   ============================================================ */

/** 화면에서 고를 수 있는 기록 종류 — 값(키)은 절대 화면에 내보내지 않는다 */
export const INQUIRY_LOG_KINDS = {
  call: "전화 통화",
  email: "메일 회신",
  quote: "견적 발송",
  meeting: "방문·미팅",
  note: "메모",
} as const;

export type InquiryLogKind = keyof typeof INQUIRY_LOG_KINDS;

/** 상태를 바꿀 때 서버가 자동으로 남기는 이력의 종류 이름 */
export const STATUS_CHANGE_KIND = "상태 변경";

export interface InquiryLogEntry {
  /** "2026.08.19 14:32" — 화면에 그대로 찍는 한국식 표기다(ISO 문자열을 남기지 않는다) */
  at: string;
  /** "견적 발송" 처럼 이미 한국어인 종류 이름 */
  kind: string;
  /** 기록을 남긴 관리자 이름 (모르면 비운다) */
  author: string | null;
  /** 여러 줄 가능 */
  body: string;
}

export interface ParsedInquiryMemo {
  /** 이력 앞에 놓인 자유 메모 */
  note: string;
  /** 오래된 것부터 */
  entries: InquiryLogEntry[];
}

/** `[2026.08.19 14:32] 견적 발송 · 김대표` 한 줄 — 뒤쪽은 종류와 작성자를 합친 부분이다 */
const HEADER_RE = /^\[(\d{4}\.\d{2}\.\d{2} \d{2}:\d{2})\] (.+)$/;
/** 종류와 작성자를 가르는 표시. 종류 이름에도 가운뎃점이 들어갈 수 있어서(방문·미팅) 앞뒤 공백까지 본다 */
const AUTHOR_SEPARATOR = " · ";

/**
 * 지금 시각을 한국 시간 기준 "2026.08.19 14:32" 로.
 * 서버가 어느 지역에서 돌든(배포 리전이 바뀐 적이 있다) 대표가 보는 시각은 한국 시간이어야 한다.
 */
export function stampKST(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  // ko-KR 의 hour 는 24시를 "24" 로 내보내는 경우가 있어 그대로 쓰면 24:05 가 된다
  const hour = get("hour") === "24" ? "00" : get("hour");
  return `${get("year")}.${get("month")}.${get("day")} ${hour}:${get("minute")}`;
}

/** 읽는 중이던 항목을 마무리한다 — 본문 줄 모음(bodyLines)이 화면 쪽으로 새 나가지 않게 여기서 걷어낸다 */
function sealed(draft: InquiryLogEntry & { bodyLines: string[] }): InquiryLogEntry {
  return {
    at: draft.at,
    kind: draft.kind,
    author: draft.author,
    body: draft.bodyLines.join("\n").trim(),
  };
}

/** 저장된 메모 한 덩어리를 자유 메모 + 이력으로 갈라 읽는다 */
export function parseInquiryMemo(memo: string | null | undefined): ParsedInquiryMemo {
  if (!memo) return { note: "", entries: [] };

  const lines = memo.replace(/\r\n/g, "\n").split("\n");
  const noteLines: string[] = [];
  const entries: InquiryLogEntry[] = [];
  let current: (InquiryLogEntry & { bodyLines: string[] }) | null = null;

  for (const line of lines) {
    const m = HEADER_RE.exec(line.trim());
    if (m) {
      if (current) entries.push(sealed(current));
      // 마지막 구분자를 기준으로 자른다 — 앞은 종류, 뒤는 작성자
      const rest = m[2].trim();
      const cut = rest.lastIndexOf(AUTHOR_SEPARATOR);
      const kind = cut > 0 ? rest.slice(0, cut).trim() : rest;
      const author = cut > 0 ? rest.slice(cut + AUTHOR_SEPARATOR.length).trim() : "";
      current = { at: m[1], kind, author: author || null, body: "", bodyLines: [] };
      continue;
    }
    if (current) current.bodyLines.push(line);
    else noteLines.push(line);
  }
  if (current) entries.push(sealed(current));

  return { note: noteLines.join("\n").trim(), entries };
}

/** 자유 메모 + 이력을 다시 한 덩어리 문자열로 */
export function composeInquiryMemo(note: string, entries: InquiryLogEntry[]): string {
  const blocks: string[] = [];
  const trimmedNote = note.trim();
  if (trimmedNote) blocks.push(trimmedNote);
  for (const e of entries) {
    const header = e.author
      ? `[${e.at}] ${e.kind}${AUTHOR_SEPARATOR}${e.author}`
      : `[${e.at}] ${e.kind}`;
    blocks.push(e.body.trim() ? `${header}\n${e.body.trim()}` : header);
  }
  return blocks.join("\n");
}

/** 종류 키가 화면에서 고를 수 있는 값인지 */
export function isInquiryLogKind(value: unknown): value is InquiryLogKind {
  return typeof value === "string" && value in INQUIRY_LOG_KINDS;
}
