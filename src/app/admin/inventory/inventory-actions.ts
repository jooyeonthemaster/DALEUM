"use client";

/* ============================================================
   재고 화면에서 서버를 부르는 동작 모음

   되돌리기와 상태 맞추기는 목록 아래 이력 섹션과 품목별 패널 양쪽에서 쓴다.
   두 곳에 따로 적으면 문구와 메모 형식이 갈라져, 나중에 이력을 볼 때
   같은 동작인데 다르게 기록된 줄이 섞인다.
   ============================================================ */

import { krw, formatDateTime } from "@/lib/format";
import { INVENTORY_REASON_LABELS } from "@/app/admin/products/product-ui";
import type { InventoryLogItem } from "./inventory-types";

export interface ActionResult {
  ok: boolean;
  message: string;
}

/**
 * 잘못 넣은 입고·조정을 반대 방향 조정으로 상쇄한다 (이력은 지우지 않고 한 줄 더 남긴다).
 *
 * 수량을 여기서 계산해 보내지 않는다 — 서버에 '어느 이력' 만 말하면 서버가 그 이력을 직접 읽어
 * 반대 수량을 넣는다. 화면이 낡은 목록을 들고 있어도 엉뚱한 수량이 들어가지 않고,
 * 같은 이력을 두 번 되돌리는 것도 서버가 거절한다(두 번 누르면 두 번 빠지던 자리다).
 */
export async function undoLog(log: InventoryLogItem): Promise<ActionResult> {
  const reasonLabel = INVENTORY_REASON_LABELS[log.reason] ?? "기타";
  try {
    const res = await fetch("/api/admin/inventory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        undoOfLogId: log.id,
        memo: `${formatDateTime(log.created_at)} ${reasonLabel} ${log.delta > 0 ? "+" : ""}${log.delta}개 되돌림`,
      }),
    });
    const data = (await res.json().catch(() => null)) as
      | { error?: string; stock?: number; before?: number }
      | null;
    if (!res.ok) return { ok: false, message: data?.error ?? "되돌리지 못했습니다." };
    return {
      ok: true,
      message: `${log.product_name}${log.variant_name ? ` — ${log.variant_name}` : ""} 재고를 ${krw(
        data?.before ?? 0
      )}개에서 ${krw(data?.stock ?? 0)}개로 되돌렸습니다.`,
    };
  } catch {
    return { ok: false, message: "되돌리지 못했습니다. 잠시 후 다시 시도해 주세요." };
  }
}

/** 재고와 어긋난 판매 상태를 재고에 맞춘다 (관리자가 눌렀을 때만) */
export async function syncSaleStatus(productId: string): Promise<ActionResult> {
  try {
    const res = await fetch("/api/admin/inventory/status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId }),
    });
    const data = (await res.json().catch(() => null)) as
      | { error?: string; message?: string }
      | null;
    if (!res.ok) return { ok: false, message: data?.error ?? "판매 상태를 바꾸지 못했습니다." };
    return { ok: true, message: data?.message ?? "판매 상태를 재고에 맞췄습니다." };
  } catch {
    return { ok: false, message: "판매 상태를 바꾸지 못했습니다. 잠시 후 다시 시도해 주세요." };
  }
}
