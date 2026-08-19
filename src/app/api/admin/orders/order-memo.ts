/* ============================================================
   admin_memo 한 칸을 **쓰는 유일한 창구**

   왜 이 파일이 따로 있어야 했는가 (돈이 걸린 자리다):
   admin_memo 는 자유 메모와 처리 이력(부분 환불 금액·잔액)을 한 칸에 같이 담는다.
   그런데 그 칸을 고치는 경로가 네 군데였고 **전부 조건 없는 read-modify-write** 였다.

     ① 주문 상세의 상시 메모는 타이핑이 멎고 900ms 뒤 PATCH 를 보낸다.
     ② 그 사이 관리자가 다른 탭에서(혹은 결제사 웹훅이) 부분 환불을 처리하면 이력이 새로 붙는다.
     ③ ①은 900ms 전에 읽어 둔 이력을 그대로 다시 써 넣는다 → ②의 환불 이력이 통째로 사라진다.
     ④ 환불 잔액은 그 이력을 되읽어 계산한다(order-refund-ledger.ts).
        기록이 사라지면 "아직 환불 안 했다" 가 되어 **같은 돈을 두 번 내보낸다.**

   화면 디바운스를 늘리는 것은 창을 좁힐 뿐 닫지 못한다(웹훅은 화면과 무관하게 들어온다).
   그래서 여기 한 곳으로 모으고, **읽어 온 시점(updated_at)을 update 조건으로 걸어**
   그 사이 누가 손댔으면 쓰기를 실패시킨 뒤 다시 읽어 자유 메모만 갈아끼우고 재시도한다.
   orders 에는 `trg_orders_updated` 트리거가 있어 어떤 갱신이든 updated_at 이 바뀐다
   (0001_init_schema.sql:210) — 그래서 이 값이 잠금 열쇠로 쓸 만하다.
   admin_memo 본문 자체를 조건으로 걸지 않은 이유: 최대 8,000자가 질의 문자열에 실려
   URL 길이 상한에 걸린다.

   ⚠ 근본 해결은 order_events 테이블 분리다. 마이그레이션은 이 유닛 소관이 아니라 방어만 한다.
   ⚠ src/lib/orders.ts 의 appendAdminMemo(웹훅 경로)는 아직 옛 방식이다 — 감독 보고 항목.
   ============================================================ */

import type { SupabaseClient } from "@supabase/supabase-js";
import { composeOrderMemo, parseOrderMemo, stampKST, type OrderEvent } from "./order-log";

export interface OrderMemoPatch {
  /** 자유 메모를 이 값으로 갈아끼운다. undefined 면 저장돼 있던 자유 메모를 그대로 둔다 */
  memo?: string;
  /** 이번 요청이 새로 남기는 이력 — 재시도할 때도 **이것만** 다시 얹는다 */
  append?: { kind: string; body: string; author?: string | null }[];
}

export interface OrderMemoResult {
  /** false = 잠금 경합이 끝내 풀리지 않았다. 부르는 쪽이 사람에게 알려야 한다 */
  ok: boolean;
  /** 저장된(또는 저장하려던) 자유 메모 */
  memo: string;
  /** 저장된 뒤의 전체 이력 — 화면은 이 값을 그대로 그린다 */
  events: OrderEvent[];
}

/**
 * 재시도 횟수와 물러서는 시간.
 *
 * 처음에는 "몇 번이면 충분하다" 며 5회를 곧바로 재시도했다. 실제로 동시 요청 10개를 던져 보니
 * **부분 환불 1건이 통째로 사라졌다** — 경합자들이 쉬지 않고 같은 순간에 다시 달려들어
 * 아무도 쓰지 못한 채 예산만 소진했고, 라우트는 그것도 모르고 200 을 돌려줬다.
 * 그래서 ① 횟수를 늘리고 ② 재시도 전에 조금씩·서로 다르게 쉰다(무작위 흔들기).
 * 최악의 경우 1.5초쯤 걸리지만, 돈 기록을 잃는 것보다는 느린 편이 낫다.
 */
const LOCK_ATTEMPTS = 12;
const BACKOFF_STEP_MS = 12;
const BACKOFF_JITTER_MS = 30;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 자유 메모 교체와 이력 덧붙이기를 **낙관적 잠금** 아래에서 한 번에 처리한다.
 *
 * 새 이력의 시각은 들어올 때 한 번만 찍는다 — 재시도할 때마다 다시 찍으면
 * 경합이 심할수록 기록 시각이 뒤로 밀려 실제 처리 시각과 어긋난다.
 */
export async function applyOrderMemo(
  service: SupabaseClient,
  orderId: string,
  patch: OrderMemoPatch
): Promise<OrderMemoResult> {
  const at = stampKST();
  const incoming: OrderEvent[] = (patch.append ?? []).map((e) => ({
    at,
    kind: e.kind,
    author: e.author?.trim() || null,
    body: e.body,
  }));

  let last: OrderMemoResult = { ok: false, memo: patch.memo ?? "", events: incoming };

  for (let attempt = 0; attempt < LOCK_ATTEMPTS; attempt += 1) {
    // 같은 순간에 다시 부딪히지 않도록 회를 거듭할수록 조금 더, 서로 다르게 쉰다
    if (attempt > 0) await sleep(attempt * BACKOFF_STEP_MS + Math.random() * BACKOFF_JITTER_MS);
    const { data: before } = await service
      .from("orders")
      .select("admin_memo, updated_at")
      .eq("id", orderId)
      .maybeSingle();
    if (!before) return { ok: false, memo: patch.memo ?? "", events: incoming };

    const stored = (before.admin_memo as string | null) ?? null;
    const parsed = parseOrderMemo(stored);
    // 자유 메모만 갈아끼운다. 이력은 **방금 다시 읽어 온 것** 뒤에 이번 것을 잇는다 —
    // 이것이 "그 사이 생긴 환불 이력이 살아남는다" 의 전부다.
    const memo = patch.memo !== undefined ? patch.memo : parsed.memo;
    const events = incoming.length > 0 ? [...parsed.events, ...incoming] : parsed.events;
    const composed = composeOrderMemo(memo, events) || null;

    last = { ok: true, memo, events };
    if (composed === stored) return last; // 바뀐 것이 없다 — 쓰기를 아낀다

    const { data: claimed, error } = await service
      .from("orders")
      .update({ admin_memo: composed })
      .eq("id", orderId)
      .eq("updated_at", before.updated_at as string)
      .select("id");

    if (error) {
      console.error("[orders/memo] 저장 실패:", error.message);
      return { ok: false, memo, events };
    }
    if (claimed && claimed.length > 0) return last;
    // 조건 불일치 = 그 사이 다른 경로가 이 주문을 갱신했다. 처음부터 다시 읽는다.
  }

  console.error(`[orders/memo] 동시 수정이 겹쳐 기록을 저장하지 못했습니다 order=${orderId}`);
  return { ...last, ok: false };
}

/**
 * 이력 한 건 덧붙이기 (자유 메모는 건드리지 않는다).
 * lib/orders.ts 의 appendAdminMemo 와 달리 ISO 시각·영문 원문을 남기지 않는다.
 */
export async function appendOrderEvent(
  service: SupabaseClient,
  orderId: string,
  event: { kind: string; body: string; author?: string | null }
): Promise<boolean> {
  const result = await applyOrderMemo(service, orderId, { append: [event] });
  return result.ok;
}
