import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cleanStr } from "@/lib/orders";
import { adjustStockRpc, readStock } from "./shared";
import { markPattern, undoMark, withMark } from "./marks";

/* ============================================================
   입출고 이력 되돌리기

   왜 별도 창구인가 (전에는 화면이 '-원래수량' 을 계산해 보통 조정처럼 보냈다):
   1. 같은 이력을 몇 번이고 되돌릴 수 있었다. 두 번 누르면 두 번 빠진다.
      되돌리기로 생긴 줄의 메모에 원본 이력 번호를 표식으로 심고, 그 표식이 이미 있으면 거절한다.
   2. 되돌릴 수량을 화면이 정해 보냈다. 화면이 낡은 목록을 들고 있으면 엉뚱한 수량이 들어간다.
      이제 서버가 원본 이력을 직접 읽어 그 반대 수량을 넣는다 — 화면은 '어느 이력' 만 말한다.
   ============================================================ */

/** 여기서 뒤집어도 되는 사유 — 주문 출고·취소 복구는 주문 쪽 장부라 여기서 건드리면 어긋난다 */
const UNDOABLE = ["restock", "adjust"];

interface LogRow {
  id: number;
  product_id: string;
  variant_id: string | null;
  delta: number;
  reason: string;
}

export function parseUndoTarget(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number.parseInt(v, 10) : NaN;
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

export async function handleUndo(
  service: SupabaseClient,
  logId: number,
  rawMemo: unknown
): Promise<NextResponse> {
  const { data, error } = await service
    .from("inventory_logs")
    .select("id, product_id, variant_id, delta, reason")
    .eq("id", logId)
    .maybeSingle();

  if (error) {
    console.error("[admin/inventory] 되돌릴 이력 조회 실패:", error.message);
    return NextResponse.json({ error: "되돌릴 이력을 불러오지 못했습니다." }, { status: 500 });
  }
  const log = data as LogRow | null;
  if (!log) {
    return NextResponse.json({ error: "되돌릴 이력을 찾을 수 없습니다." }, { status: 404 });
  }
  if (!UNDOABLE.includes(log.reason)) {
    return NextResponse.json(
      { error: "주문에서 생긴 기록이라 여기서 되돌릴 수 없습니다. 주문 관리에서 처리해 주세요." },
      { status: 400 }
    );
  }

  const mark = undoMark(log.id);
  const { data: already, error: markError } = await service
    .from("inventory_logs")
    .select("id")
    .ilike("memo", markPattern(mark))
    .limit(1);
  if (markError) {
    console.error("[admin/inventory] 되돌림 여부 확인 실패:", markError.message);
    return NextResponse.json(
      { error: "이미 되돌린 이력인지 확인하지 못했습니다. 잠시 후 다시 시도해 주세요." },
      { status: 500 }
    );
  }
  if ((already ?? []).length > 0) {
    return NextResponse.json(
      {
        error:
          "이미 되돌린 이력입니다. 두 번 빠지지 않도록 그대로 두었습니다. 목록을 새로 고쳐 확인해 주세요.",
      },
      { status: 409 }
    );
  }

  const before = await readStock(service, log.product_id, log.variant_id);
  const applied = await adjustStockRpc(service, {
    productId: log.product_id,
    variantId: log.variant_id,
    delta: -log.delta,
    reason: "adjust",
    memo: withMark(cleanStr(rawMemo, 200), mark),
  });
  if (!applied.ok) {
    const status = applied.kind === "insufficient" ? 409 : applied.kind === "notfound" ? 404 : 500;
    return NextResponse.json({ error: applied.message }, { status });
  }

  const stock = await readStock(service, log.product_id, log.variant_id);
  return NextResponse.json({ ok: true, before, stock, delta: -log.delta });
}
