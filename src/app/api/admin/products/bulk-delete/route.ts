import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { CACHE_TAGS } from "@/lib/cache";
import { isUuid } from "@/lib/orders";

/* ============================================================
   POST /api/admin/products/bulk-delete — 선택한 상품 일괄 삭제

   왜 별도 라우트인가:
   지우는 일은 bulk-edit 의 한 종류가 아니다. bulk-edit 은 "값을 바꾼다" 는 전제로
   parseProductFields / assertSellablePrice 를 통과시키는데, 삭제에는 통과시킬 값 자체가
   없다. 같은 라우트에 kind:"delete" 를 끼워 넣으면 그 검증 흐름을 전부 우회하는
   분기가 하나 생기고, 나중에 누가 검증을 손볼 때 삭제 경로만 조용히 빠진다.

   왜 DELETE 가 아니라 POST 인가:
   지울 id 목록을 본문에 실어야 하는데, DELETE 요청의 본문은 중간 프록시·CDN 이
   버려도 규격 위반이 아니다. 목록이 사라진 DELETE 는 "아무것도 안 지움"으로 끝나므로
   손해가 없지만, 관리자에게는 이유 없는 실패로만 보인다. 본문이 보장되는 POST 를 쓴다.

   설계 원칙은 bulk-edit 과 같다 — **결과를 정직하게 돌려준다.**
   Supabase 는 여러 행을 한 트랜잭션으로 묶어 주지 않으므로 "전부 성공" 을 약속할 수
   없다. 무엇이 지워졌고 무엇이 왜 남았는지를 행 단위로 돌려준다.
   ============================================================ */

/**
 * 이 라우트가 한 번에 쓸 수 있는 시간(초).
 * 명시하지 않으면 배포 플랫폼 기본값(짧다)에 걸려 도중에 끊긴다. 삭제가 도중에 끊기면
 * 앞쪽 상품은 이미 사라진 채 관리자에게는 "연결이 끊겼습니다" 만 남는다.
 */
export const maxDuration = 60;

/** 한 번에 다룰 수 있는 최대 상품 수 — 화면이 실제로 고를 수 있는 수(한 페이지 100개)에 맞춘다 */
const MAX_IDS = 100;

interface TargetRow {
  id: string;
  name: string;
  /**
   * 주문 이력 존재 여부만 본다.
   *
   * 상품마다 count 를 세면 상품 수만큼 왕복이 생기고, 반대로 order_items 를 통째로
   * 받아 오면 인기 상품 하나 때문에 수천 행이 딸려 온다(그리고 PostgREST 기본 상한에
   * 잘리면 '주문 없음' 으로 잘못 판정한다 — 주문 이력이 있는 상품을 지우는 사고다).
   * 그래서 상품에 order_items 를 **상품당 1건까지만** 붙여 한 번에 받는다.
   */
  order_items: { id: string }[];
}

/** 지우지 못한 상품 한 건 — 이름과 이유를 함께 돌려줘야 관리자가 다음 행동을 안다 */
interface Note {
  id: string;
  name: string;
  reason: string;
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const { service } = auth;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });

  const rawIds = Array.isArray(body.ids) ? body.ids : [];
  const ids = [...new Set(rawIds.filter((v): v is string => typeof v === "string" && isUuid(v)))];
  if (ids.length === 0) {
    return NextResponse.json({ error: "삭제할 상품을 먼저 선택해 주세요." }, { status: 400 });
  }
  if (ids.length > MAX_IDS) {
    return NextResponse.json(
      { error: `한 번에 ${MAX_IDS}개까지만 지울 수 있습니다. 나눠서 진행해 주세요.` },
      { status: 400 }
    );
  }

  const { data, error } = await service
    .from("products")
    .select("id, name, order_items(id)")
    .in("id", ids)
    .limit(1, { referencedTable: "order_items" });
  if (error) {
    console.error("[admin/products/bulk-delete] 대상 조회 실패:", error.message);
    return NextResponse.json({ error: "상품 정보를 불러오지 못했습니다." }, { status: 500 });
  }

  const rows = new Map<string, TargetRow>(((data ?? []) as TargetRow[]).map((r) => [r.id, r]));

  const failed: Note[] = [];
  const skipped: Note[] = [];
  const deletable: string[] = [];

  for (const id of ids) {
    const row = rows.get(id);
    if (!row) {
      // 목록을 띄워 둔 사이 다른 창에서 이미 지운 경우 — 실패가 아니라 이미 이뤄진 일이다
      skipped.push({
        id,
        name: "이미 삭제된 상품",
        reason: "목록을 불러온 뒤 이미 지워져 있었습니다.",
      });
      continue;
    }
    if (row.order_items.length > 0) {
      // 단건 삭제(409)와 같은 규칙 — order_items.product_id 는 on delete set null 이라
      // 지워도 DB 는 막지 않는다. 대신 주문 내역에서 상품이 통째로 사라진다.
      failed.push({
        id,
        name: row.name,
        reason: "주문 이력이 있어 삭제할 수 없습니다. 상태를 '숨김' 으로 바꿔 주세요.",
      });
      continue;
    }
    deletable.push(id);
  }

  let ok = 0;
  if (deletable.length > 0) {
    /* 한 문장으로 지운다. .select() 를 붙이면 **실제로 지워진 행**이 돌아오므로,
       요청한 것과 대조해 조용히 남은 상품을 잡아낼 수 있다. */
    const { data: removed, error: deleteError } = await service
      .from("products")
      .delete()
      .in("id", deletable)
      .select("id");

    if (deleteError) {
      /* DELETE 한 문장은 한 행만 걸려도 통째로 롤백된다 — 여기서 끝내면 "전부 실패" 만
         남고 무엇이 걸림돌인지 알 수 없다. 한 건씩 다시 시도해 걸린 상품만 가려낸다. */
      console.error("[admin/products/bulk-delete] 일괄 삭제 실패:", deleteError.message);
      for (const id of deletable) {
        const { error: oneError } = await service.from("products").delete().eq("id", id);
        if (oneError) {
          failed.push({
            id,
            name: rows.get(id)?.name ?? "이름을 알 수 없는 상품",
            reason: "삭제 중 오류가 났습니다. 다시 시도해 주세요.",
          });
          continue;
        }
        ok += 1;
      }
    } else {
      const removedIds = new Set(((removed ?? []) as { id: string }[]).map((r) => r.id));
      ok = removedIds.size;
      for (const id of deletable) {
        if (removedIds.has(id)) continue;
        failed.push({
          id,
          name: rows.get(id)?.name ?? "이름을 알 수 없는 상품",
          reason: "삭제되지 않았습니다. 다시 시도해 주세요.",
        });
      }
    }
  }

  // 한 건이라도 실제로 사라진 뒤에만 카탈로그 캐시를 비운다.
  // (목록/개수/상세/관련상품 캐시가 모두 이 태그에 걸려 있다 — 단건 삭제와 같은 방식)
  if (ok > 0) revalidateTag(CACHE_TAGS.products, { expire: 0 });

  return NextResponse.json({ ok, failed, skipped, changes: [] });
}
