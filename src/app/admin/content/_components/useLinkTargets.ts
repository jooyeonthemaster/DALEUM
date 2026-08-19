"use client";

/* ============================================================
   배너·팝업이 보낼 수 있는 곳(상품·카테고리)의 이름 목록을 한 번만 불러온다.

   목록 화면에서도 필요하다 — 저장된 주소를 원문 그대로 찍지 않고
   "곤약면 상세 상품 페이지" 처럼 이름으로 바꿔 보여 주기 위해서다.
   상품 27개·카테고리 7개라 한 번에 다 받아도 가볍다.
   ============================================================ */

import { useEffect, useState } from "react";
import { EMPTY_TARGETS, type LinkTargetsData } from "./link-targets";

/** 고객이 실제로 볼 수 있는 상태만 — 숨김·임시저장 상품으로 보내면 죽은 링크가 된다 */
const LINKABLE_STATUSES = new Set(["active", "sold_out"]);

interface ProductRow {
  slug: string;
  name: string;
  status: string;
}

interface CategoryRow {
  slug: string;
  name: string;
  is_active: boolean;
}

export function useLinkTargets(): { targets: LinkTargetsData; loading: boolean } {
  const [targets, setTargets] = useState<LinkTargetsData>(EMPTY_TARGETS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    // 데이터 로드 — setState는 모두 fetch 완료(await) 이후에만 실행된다
    void (async () => {
      try {
        const [productRes, categoryRes] = await Promise.all([
          fetch("/api/admin/products?limit=100&sort=name&dir=asc", { cache: "no-store" }),
          fetch("/api/admin/categories", { cache: "no-store" }),
        ]);
        const productBody = productRes.ok
          ? ((await productRes.json()) as { products?: ProductRow[] })
          : null;
        const categoryBody = categoryRes.ok
          ? ((await categoryRes.json()) as { categories?: CategoryRow[] })
          : null;
        if (!alive) return;
        setTargets({
          products: (productBody?.products ?? [])
            .filter((p) => LINKABLE_STATUSES.has(p.status))
            .map((p) => ({ slug: p.slug, name: p.name })),
          categories: (categoryBody?.categories ?? [])
            .filter((c) => c.is_active)
            .map((c) => ({ slug: c.slug, name: c.name })),
        });
      } catch {
        // 목록을 못 불러와도 화면은 살아 있어야 한다 — 직접 입력으로 넘어갈 수 있다
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  return { targets, loading };
}
