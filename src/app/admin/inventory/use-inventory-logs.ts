"use client";

import { useEffect, useState } from "react";
import type { InventoryLogItem, InventoryLogsResponse } from "./inventory-types";

export interface UseInventoryLogsParams {
  /** 특정 상품만 (없으면 전체) */
  productId?: string | null;
  /** 특정 옵션만. "none" 이면 옵션 없는(상품 자체 재고) 이력만 */
  variantId?: string | null;
  /** 상품명 일부. 빈 문자열이면 전체 */
  q?: string;
  /** 빈 문자열이면 사유 전체 */
  reason?: string;
  /** yyyy-mm-dd (관리자가 보는 달력 기준) */
  from?: string;
  to?: string;
  page: number;
  limit: number;
  /** 닫혀 있는 패널이 불필요하게 조회하지 않도록 */
  enabled?: boolean;
  /** 값이 바뀌면 다시 조회 (입고 저장 후 등) */
  refreshKey?: number;
}

interface LoadedLogs {
  /** 이 결과가 어떤 조건으로 받아온 것인지 — 조건이 바뀌면 곧바로 '읽는 중'이 된다 */
  key: string;
  logs: InventoryLogItem[];
  total: number;
  totalPages: number;
}

/**
 * 날짜 칸을 그날의 시작/끝으로 넓혀 ISO 로 바꾼다.
 * 서버에서 yyyy-mm-dd 를 해석하면 UTC 로 잡혀 관리자가 고른 날짜와 하루가 어긋난다.
 */
function dayStartIso(day: string): string | null {
  if (!day) return null;
  const d = new Date(`${day}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
function dayEndIso(day: string): string | null {
  if (!day) return null;
  const d = new Date(`${day}T23:59:59.999`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * 입출고 이력 조회 — 전체 이력 섹션과 품목별 패널이 같은 규칙을 쓰도록 한 곳에 모았다.
 *
 * 로딩 상태를 따로 두지 않고 "받아온 조건(key)이 지금 조건과 같은가"로 판단한다.
 * 효과 안에서 곧바로 상태를 비우면 렌더가 연쇄로 다시 도는데, 이 저장소의 React 규칙이
 * 그것을 막는다. 조건을 결과에 붙여 두면 비울 필요 자체가 없어진다.
 */
export function useInventoryLogs({
  productId = null,
  variantId = null,
  q = "",
  reason = "",
  from = "",
  to = "",
  page,
  limit,
  enabled = true,
  refreshKey = 0,
}: UseInventoryLogsParams) {
  const key = [productId, variantId, q, reason, from, to, page, limit, refreshKey].join("|");
  const [loaded, setLoaded] = useState<LoadedLogs | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    (async () => {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (q) params.set("q", q);
      if (productId) params.set("productId", productId);
      if (variantId) params.set("variantId", variantId);
      if (reason) params.set("reason", reason);
      const fromIso = dayStartIso(from);
      const toIso = dayEndIso(to);
      if (fromIso) params.set("from", fromIso);
      if (toIso) params.set("to", toIso);

      try {
        const res = await fetch(`/api/admin/inventory/logs?${params.toString()}`);
        const data = (await res.json().catch(() => null)) as InventoryLogsResponse | null;
        if (cancelled) return;
        if (res.ok && data?.logs) {
          setLoaded({ key, logs: data.logs, total: data.total, totalPages: data.totalPages });
        } else {
          setLoaded({ key, logs: [], total: 0, totalPages: 1 });
        }
      } catch {
        // 이력 조회 실패는 재고 목록과 독립적으로 비운다 (본 화면까지 막을 이유가 없다)
        if (!cancelled) setLoaded({ key, logs: [], total: 0, totalPages: 1 });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [key, productId, variantId, q, reason, from, to, page, limit, enabled, refreshKey]);

  const ready = loaded !== null && loaded.key === key;
  return {
    logs: ready ? loaded.logs : null,
    // 조건이 바뀌는 동안 쪽수를 0으로 떨어뜨리면 페이지 버튼이 깜박이므로 직전 값을 유지한다
    total: loaded?.total ?? 0,
    totalPages: loaded?.totalPages ?? 1,
  };
}
