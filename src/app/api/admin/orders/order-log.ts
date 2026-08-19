/* ============================================================
   주문 처리 이력 — orders.admin_memo 한 칸을 "자유 메모 + 이력" 으로 갈라 쓰는 규칙

   왜 이런 방식인가:
   ① 지금까지 시스템이 남긴 기록과 사람이 쓰는 메모가 **같은 칸** 을 썼다.
      lib/orders.ts 의 appendAdminMemo 는 `[ISO] 내용` 한 줄을 덧붙이는데,
      주문 상세의 메모 입력칸은 같은 컬럼을 900ms 뒤 통째로 덮어썼다.
      그래서 대표가 "지저분하다" 며 메모를 정리하면 부분 환불 이력이 영구히 사라졌다.
      돈이 오간 근거가 메모 정리 한 번에 날아가는 구조였다.
   ② 그 기록에는 UTC ISO 시각, 영문 Postgres 오류 원문, 상품 UUID, paymentKey 가 그대로 들어 있었다.
      대표가 볼 화면에 나가서는 안 되는 것들이다.

   테이블(order_events)을 새로 만드는 것이 정석이지만 이번 파도에서 마이그레이션은 이 유닛 소관이
   아니다. 그래서 업소용·OEM 문의 화면이 이미 쓰고 있는 방식(admin_memo 한 칸에 이력을 쌓는다)과
   같은 결로, 다만 **기존 lib 이 남긴 옛 형식도 함께 읽을 수 있게** 파서를 짠다.

   저장 형태 (사람이 그대로 읽어도 말이 되는 한국어여야 한다):

     자유 메모는 맨 위에 온다. 이력 줄이 나오기 전까지가 자유 메모다.
     [2026.08.19 14:32] 부분 환불 · 관리자
     10,000원을 환불했습니다. (사유: 고객 요청)
     남은 환불 가능액 30,000원

   옛 형식 `[2026-08-19T09:12:33.123Z] 부분 환불 10,000원 — 고객 요청` 도 이력으로 읽어
   한국 시간과 사람 말로 바꿔 보여준다. 원문은 화면에 내보내지 않는다.
   ============================================================ */

import type { SupabaseClient } from "@supabase/supabase-js";

export interface OrderEvent {
  /** "2026.08.19 14:32" — 한국 시간 표기를 그대로 화면에 찍는다(ISO 문자열을 내보내지 않는다) */
  at: string;
  /** 이미 한국어인 종류 이름 */
  kind: string;
  /** 남긴 사람 (모르면 null) */
  author: string | null;
  /** 여러 줄 가능 */
  body: string;
}

export interface ParsedOrderMemo {
  /** 이력 앞에 놓인 자유 메모 */
  memo: string;
  /** 오래된 것부터 */
  events: OrderEvent[];
}

/* ---------- 이력 종류 (화면에 그대로 나가는 한국어) ---------- */
export const EVENT_KINDS = {
  status: "상태 변경",
  refundPartial: "부분 환불",
  refundFull: "환불 처리",
  cancel: "주문 취소",
  shipping: "배송지 변경",
  tracking: "운송장",
  memo: "메모",
  attention: "확인 필요",
} as const;

/**
 * 결제사(토스) 쪽에서 부분 취소가 일어났을 때 남는 이력 본문.
 *
 * 웹훅은 **금액을 적지 않는다** — `api/payments/webhook/route.ts` 는 "잔여 결제액 확인 필요" 만
 * 남긴다. 그래서 아래 refundLedger 의 뺄셈에 그 금액이 잡히지 않고, 화면의 '환불 가능 잔액' 이
 * 실제보다 크게 보인다. 그 숫자를 믿고 환불하면 초과 환불이다.
 * 웹훅이 금액·잔액을 함께 적도록 고치는 것은 이 유닛 소관이 아니라서, 우선 이 문장이 남아 있는
 * 주문은 잔액을 "확정값이 아니다" 로 표시해 사람이 결제사 화면과 대조하게 만든다.
 */
export const PG_PARTIAL_CANCEL_NOTE =
  "결제사에서 부분 취소가 처리되었습니다. 남은 결제 금액을 확인해 주세요.";

/** 관리자가 메모를 남길 때 고르는 유형 — 키는 절대 화면에 내보내지 않는다 */
export const MEMO_KINDS: Record<string, string> = {
  note: "메모",
  call: "고객 통화",
  claim: "불만·클레임",
  refundTalk: "환불 협의",
  shipping: "발송 메모",
};

/** 새 형식 머리줄: `[2026.08.19 14:32] 부분 환불 · 관리자` */
const HEADER_RE = /^\[(\d{4}\.\d{2}\.\d{2} \d{2}:\d{2})\] ([^·\n]+?)(?: · (.+))?$/;
/** 옛 형식(lib/orders.ts): `[2026-08-19T09:12:33.123Z] 내용` */
const LEGACY_RE = /^\[(\d{4}-\d{2}-\d{2}T[\d:.]+Z)\] (.*)$/;

/**
 * 지금 시각을 한국 시간 "2026.08.19 14:32" 로.
 * 배포 리전이 바뀐 적이 있는 저장소다 — 서버가 어디서 돌든 대표가 보는 시각은 한국 시간이어야 한다.
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
  // ko-KR 은 자정을 "24" 로 내보내는 경우가 있어 그대로 쓰면 24:05 가 된다
  const hour = get("hour") === "24" ? "00" : get("hour");
  return `${get("year")}.${get("month")}.${get("day")} ${hour}:${get("minute")}`;
}

/* ---------- 기술 문자열 세탁 ---------- */

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
/** 영문이 길게 이어지면 DB·결제사 원문 오류로 본다 (한국어 운영 메모에는 나올 일이 없다) */
const TECHNICAL_RE = /[A-Za-z_]{10,}/;

function scrub(text: string): string {
  return text
    .replace(/\(?\s*paymentKey\s*:\s*[\w-]+\s*\)?/gi, "")
    .replace(UUID_RE, "")
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** " / " 로 이어 붙인 실패 목록의 건수 — "상품 3종" 처럼 세어 주기 위해 */
function countFailures(tail: string): number {
  const n = tail.split(" / ").filter((s) => s.trim()).length;
  return n > 0 ? n : 1;
}

/**
 * 옛 형식 한 줄을 종류 + 사람 말 본문으로 옮긴다.
 * 여기 없는 문구는 마지막에 영문 덩어리가 남아 있으면 통째로 감춘다 —
 * 개발자용 원문을 화면에 뿌리느니 "서버 기록을 보라" 고 말하는 편이 낫다.
 */
export function humanizeLegacyNote(note: string): { kind: string; body: string } {
  const partial = /^부분 환불 ([\d,]+)원 — (.+)$/.exec(note);
  if (partial) {
    return {
      kind: EVENT_KINDS.refundPartial,
      body: `${partial[1]}원을 환불했습니다. (사유: ${partial[2].trim()})`,
    };
  }

  if (note.startsWith("재고 차감 실패")) {
    const n = countFailures(note.split(":").slice(1).join(":"));
    return {
      kind: EVENT_KINDS.attention,
      body: `결제 뒤 재고가 자동으로 줄지 않았습니다. 재고 관리에서 상품 ${n}종의 수량을 직접 맞춰 주세요.`,
    };
  }
  if (note.startsWith("재고 복구 실패")) {
    const n = countFailures(note.split(":").slice(1).join(":"));
    return {
      kind: EVENT_KINDS.attention,
      body: `환불했지만 재고가 자동으로 복구되지 않았습니다. 재고 관리에서 상품 ${n}종의 수량을 직접 더해 주세요.`,
    };
  }
  if (note.startsWith("payments 기록 실패")) {
    return {
      kind: EVENT_KINDS.attention,
      body: "결제는 승인됐지만 결제 내역을 저장하지 못했습니다. 결제 정보 칸이 비어 있으면 결제사 화면에서 대조해 주세요.",
    };
  }
  if (note.startsWith("승인 금액 불일치")) {
    return {
      kind: EVENT_KINDS.attention,
      body: "결제 금액이 주문 금액과 달라 자동 취소를 시도했지만 실패했습니다. 결제사 화면에서 직접 취소해 주세요.",
    };
  }
  if (note.startsWith("웹훅 금액 불일치")) {
    return {
      kind: EVENT_KINDS.attention,
      body: "주문 금액과 실제 결제 금액이 다릅니다. 결제사 내역을 확인해 주세요.",
    };
  }
  if (note.startsWith("토스 부분 취소 웹훅")) {
    return { kind: EVENT_KINDS.attention, body: PG_PARTIAL_CANCEL_NOTE };
  }

  const cleaned = scrub(note);
  if (!cleaned || TECHNICAL_RE.test(cleaned)) {
    return {
      kind: EVENT_KINDS.attention,
      body: "처리 중 문제가 있었습니다. 자세한 내용은 서버 기록에 남겼습니다.",
    };
  }
  return { kind: EVENT_KINDS.memo, body: cleaned };
}

/** 옛 형식의 UTC ISO 를 한국 시간 표기로 */
function legacyStamp(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? stampKST() : stampKST(d);
}

/* ---------- 파싱 / 조립 ---------- */

/** 저장된 한 덩어리를 자유 메모 + 이력으로 갈라 읽는다 */
export function parseOrderMemo(memo: string | null | undefined): ParsedOrderMemo {
  if (!memo) return { memo: "", events: [] };

  const lines = memo.replace(/\r\n/g, "\n").split("\n");
  const memoLines: string[] = [];
  const events: OrderEvent[] = [];
  let current: (OrderEvent & { bodyLines: string[] }) | null = null;

  const flush = () => {
    if (current) {
      events.push({
        at: current.at,
        kind: current.kind,
        author: current.author,
        body: current.bodyLines.join("\n").trim(),
      });
      current = null;
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();
    const head = HEADER_RE.exec(trimmed);
    if (head) {
      flush();
      current = {
        at: head[1],
        kind: head[2].trim(),
        author: head[3]?.trim() || null,
        body: "",
        bodyLines: [],
      };
      continue;
    }
    const legacy = LEGACY_RE.exec(trimmed);
    if (legacy) {
      flush();
      const { kind, body } = humanizeLegacyNote(legacy[2].trim());
      events.push({ at: legacyStamp(legacy[1]), kind, author: null, body });
      continue;
    }
    if (current) current.bodyLines.push(line);
    else memoLines.push(line);
  }
  flush();

  return { memo: memoLines.join("\n").trim(), events };
}

/** 한 칸에 담는 글자 수 상한 — 컬럼은 text 라 무제한이지만, 무한히 불어나게 두지 않는다 */
export const MEMO_STORAGE_LIMIT = 8000;

/**
 * 상한을 넘길 때 **마지막까지 지키는** 이력.
 * 환불 잔액을 이 이력에서 되읽기 때문에(refundLedger), 환불 기록이 잘려 나가면
 * 이미 환불한 금액이 없던 일이 되어 초과 환불이 열린다. 돈이 나간 뒤에는 되돌릴 수 없다.
 */
const CRITICAL_KINDS: string[] = [
  EVENT_KINDS.refundPartial,
  EVENT_KINDS.refundFull,
  EVENT_KINDS.cancel,
];

/**
 * 분량이 넘쳐 오래된 기록을 접었다는 표시.
 *
 * '처리 이력' 화면은 "남긴 기록은 지워지지 않습니다" 라고 안내해 왔는데, 그 말은 환불·취소에만
 * 참이다. 통화·클레임·메모는 상한을 넘기면 실제로 접힌다. 접혔다는 사실조차 남기지 않으면
 * 나중에 "그때 통화 기록을 분명히 남겼는데" 를 확인할 방법이 없다 — 그래서 자리에 한 줄을 남긴다.
 */
export const MEMO_TRIM_NOTICE =
  "분량이 넘쳐 오래된 통화·메모 기록 일부를 정리했습니다. 환불·취소 기록은 그대로 남아 있습니다.";

/** 접기에서 지켜야 하는 이력 — 돈의 근거와, 접었다는 사실 그 자체 */
function isProtected(e: OrderEvent): boolean {
  return CRITICAL_KINDS.includes(e.kind) || e.body === MEMO_TRIM_NOTICE;
}

function renderMemo(memo: string, events: OrderEvent[]): string {
  const blocks: string[] = [];
  const trimmed = memo.trim();
  if (trimmed) blocks.push(trimmed);
  for (const e of events) {
    const header = e.author ? `[${e.at}] ${e.kind} · ${e.author}` : `[${e.at}] ${e.kind}`;
    blocks.push(e.body.trim() ? `${header}\n${e.body.trim()}` : header);
  }
  return blocks.join("\n");
}

/**
 * 자유 메모 + 이력을 다시 한 덩어리로. 이력은 새 형식으로만 다시 쓴다(옛 원문은 남기지 않는다).
 *
 * ⚠ 잘라내는 순서가 곧 돈의 안전장치다.
 * 예전 호출부는 전부 `composeOrderMemo(...).slice(0, 8000)` 이었는데, 그건 **뒤쪽부터** 자른다.
 * 이력은 뒤로 쌓이므로 가장 최근 환불 기록이 먼저 사라지고, 그러면 refundLedger 가
 * "아직 환불 안 했다" 고 읽어 같은 돈을 두 번 내보낼 수 있었다.
 * 그래서 ① 자유 메모 → ② 환불이 아닌 오래된 이력 → ③ 그래도 넘치면 오래된 이력 순으로 줄인다.
 */
export function composeOrderMemo(
  memo: string,
  events: OrderEvent[],
  limit: number = MEMO_STORAGE_LIMIT
): string {
  const full = renderMemo(memo, events);
  if (full.length <= limit) return full;

  // ① 자유 메모부터 줄인다 — 사람이 다시 쓸 수 있는 글이고, 돈의 근거는 아니다
  const eventsOnly = renderMemo("", events);
  if (eventsOnly.length < limit) {
    const room = limit - eventsOnly.length - 1; // 사이에 들어갈 줄바꿈 한 칸
    return renderMemo(memo.trim().slice(0, Math.max(0, room)), events);
  }

  // ② 이력만으로도 넘친다 — 환불·취소가 아닌 것부터 오래된 순으로 접는다
  const kept = [...events];
  let dropped = false;
  for (let i = 0; i < kept.length && renderMemo("", kept).length > limit; ) {
    if (isProtected(kept[i])) {
      i += 1;
      continue;
    }
    kept.splice(i, 1);
    dropped = true;
  }

  // 지운 자리에 "여기서 접었다" 를 남긴다. 시각은 남은 가장 오래된 이력에 맞춰 꽂아
  // 화면에서 이력이 시간 순서대로 읽히게 한다(지금 시각을 쓰면 맨 아래에 미래가 찍힌다).
  // 이 줄 자체도 보호 대상이라 다음 정리 때 또 지워지지 않고, 중복해서 쌓이지도 않는다.
  if (dropped && !kept.some((e) => e.body === MEMO_TRIM_NOTICE)) {
    kept.unshift({
      at: kept[0]?.at ?? stampKST(),
      kind: EVENT_KINDS.attention,
      author: null,
      body: MEMO_TRIM_NOTICE,
    });
    for (let i = 0; i < kept.length && renderMemo("", kept).length > limit; ) {
      if (isProtected(kept[i])) {
        i += 1;
        continue;
      }
      kept.splice(i, 1);
    }
  }

  // ③ 환불 이력만 남았는데도 넘치는 상태 — 여기까지 오면 이미 비정상이지만
  //    그래도 최근 것을 남기는 편이 잔액 계산에 덜 위험하다
  while (kept.length > 1 && renderMemo("", kept).length > limit) kept.shift();
  return renderMemo("", kept).slice(0, limit);
}

/* 이력을 실제로 **쓰는** 일(applyOrderMemo / appendOrderEvent)은 order-memo.ts 로 옮겼다.
   조건 없는 read-modify-write 가 환불 이력을 통째로 덮어써 초과 환불을 열던 자리라,
   쓰기 창구를 한 곳으로 모으고 낙관적 잠금을 걸었다. 이 파일은 순수 변환만 남긴다. */

/** 로그인한 관리자의 표시 이름 — 없으면 "관리자" (메일 주소는 화면에 내보내지 않는다) */
export async function adminDisplayName(service: SupabaseClient, userId: string): Promise<string> {
  const { data } = await service.from("profiles").select("name").eq("id", userId).maybeSingle();
  const name = typeof data?.name === "string" ? data.name.trim() : "";
  return name || "관리자";
}
