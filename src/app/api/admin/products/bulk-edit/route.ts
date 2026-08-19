import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { CACHE_TAGS } from "@/lib/cache";
import { isUuid } from "@/lib/orders";
import {
  adjustPrice,
  parsePlan,
  type PriceAdjustPlan,
} from "@/app/admin/products/_list/price-math";
import { InputError, PRODUCT_STATUSES, parseProductFields, assertSellablePrice } from "../shared";

/* ============================================================
   PATCH /api/admin/products/bulk-edit — 선택한 상품 일괄 수정

   왜 필요했나:
   여태 여러 상품의 상태·카테고리·추천·가격을 한 번에 바꾸는 방법이 관리자 화면에
   없었다. "수다락 13개 판매가 8% 인상" 같은 실무는 개발자가 스크립트를 돌려야만
   됐고, 화면에서는 상품을 하나씩 열어 암산한 값을 타이핑하는 수밖에 없었다.

   설계 원칙 두 가지:
   1) 검증은 단건 수정과 똑같은 함수(parseProductFields / assertSellablePrice)를 쓴다.
      일괄이라는 이유로 검증이 느슨해지면, 목록에서 한 번에 27개를 망가뜨릴 수 있다.
   2) 결과를 정직하게 돌려준다. Supabase 는 여러 행 update 를 한 트랜잭션으로 묶어 주지
      않으므로 "전부 성공" 을 약속할 수 없다. 대신 성공 건수와 실패한 상품명·사유를
      행 단위로 돌려주어 관리자가 무엇이 안 됐는지 알게 한다.
   ============================================================ */

/**
 * 이 라우트가 한 번에 쓸 수 있는 시간(초).
 *
 * 명시하지 않으면 배포 플랫폼의 기본값(짧다)에 걸려 도중에 끊긴다.
 * 일괄 편집에서 도중에 끊기는 것은 그냥 실패가 아니다 — **앞쪽 상품은 이미 저장된 채로**
 * 관리자에게는 "연결이 끊겼습니다" 만 뜬다. 무엇이 바뀌고 무엇이 안 바뀌었는지
 * 알 방법이 없어진다. 그래서 시간과 건수 상한을 둘 다 사실에 맞게 못 박는다.
 */
export const maxDuration = 60;

/**
 * 한 번에 다룰 수 있는 최대 상품 수.
 *
 * 200 이었는데 실제로 200개를 넣으면 끝나지 않았다(그때는 상품 한 건에 UPDATE 한 번씩,
 * 왕복 200번이었다). 지금은 같은 값이 되는 상품끼리 묶어 한 번에 UPDATE 하므로
 * 상태·카테고리·추천은 왕복 1번이고, 가격도 서로 다른 결과값 수만큼만 왕복한다.
 * 그럼에도 상한은 화면이 실제로 고를 수 있는 수(한 페이지 최대 100개)에 맞춘다 —
 * 화면에서 만들 수 없는 크기를 받아 주는 것은 약속만 크게 하는 것이다.
 */
const MAX_IDS = 100;

type BulkAction =
  | { kind: "status"; value: (typeof PRODUCT_STATUSES)[number] }
  | { kind: "category"; value: string | null }
  | { kind: "featured"; value: boolean }
  | { kind: "price"; plan: PriceAdjustPlan };

interface TargetRow {
  id: string;
  name: string;
  status: string;
  price: number;
  compare_at_price: number | null;
  cost_price: number | null;
}

function parseAction(raw: unknown): BulkAction | null {
  if (!raw || typeof raw !== "object") return null;
  const a = raw as Record<string, unknown>;

  if (a.kind === "status") {
    if (!PRODUCT_STATUSES.includes(a.value as (typeof PRODUCT_STATUSES)[number])) return null;
    return {
      kind: "status",
      value: a.value as (typeof PRODUCT_STATUSES)[number],
    };
  }
  if (a.kind === "category") {
    if (a.value === null || a.value === "") return { kind: "category", value: null };
    if (typeof a.value === "string" && isUuid(a.value)) {
      return { kind: "category", value: a.value };
    }
    return null;
  }
  if (a.kind === "featured") {
    if (typeof a.value !== "boolean") return null;
    return { kind: "featured", value: a.value };
  }
  if (a.kind === "price") {
    const plan = parsePlan(a.plan);
    return plan ? { kind: "price", plan } : null;
  }
  return null;
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const { service } = auth;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });

  const rawIds = Array.isArray(body.ids) ? body.ids : [];
  const ids = [...new Set(rawIds.filter((v): v is string => typeof v === "string" && isUuid(v)))];
  if (ids.length === 0) {
    return NextResponse.json({ error: "변경할 상품을 먼저 선택해 주세요." }, { status: 400 });
  }
  if (ids.length > MAX_IDS) {
    return NextResponse.json(
      {
        error: `한 번에 ${MAX_IDS}개까지만 바꿀 수 있습니다. 나눠서 진행해 주세요.`,
      },
      { status: 400 }
    );
  }

  const action = parseAction(body.action);
  if (!action) {
    return NextResponse.json({ error: "요청한 변경 내용을 이해하지 못했습니다." }, { status: 400 });
  }

  const { data, error } = await service
    .from("products")
    .select("id, name, status, price, compare_at_price, cost_price")
    .in("id", ids);
  if (error) {
    console.error("[admin/products/bulk-edit] 대상 조회 실패:", error.message);
    return NextResponse.json({ error: "상품 정보를 불러오지 못했습니다." }, { status: 500 });
  }

  const rows = new Map<string, TargetRow>(((data ?? []) as TargetRow[]).map((r) => [r.id, r]));

  const failed: { id: string; name: string; reason: string }[] = [];
  const skipped: { id: string; name: string; reason: string }[] = [];
  const changes: {
    id: string;
    name: string;
    before: number | null;
    after: number | null;
  }[] = [];

  /**
   * 같은 값이 되는 상품끼리 묶는다.
   *
   * 예전에는 상품 한 건마다 UPDATE 를 한 번씩 보냈다. 상태·카테고리·추천은 27개든
   * 100개든 **똑같은 값**을 쓰는데도 왕복을 100번 했고, 그 왕복이 함수 실행 시간을
   * 먹어 중간에 끊기면 앞쪽만 저장된 상태가 남았다. 검증은 지금도 상품 한 건씩 하고
   * (0원인데 판매중으로 올리려는 상품은 그 한 건만 실패해야 한다), 저장만 묶는다.
   * 가격도 반올림 뒤 결과값이 같은 상품끼리는 한 번에 저장된다.
   */
  const groups = new Map<string, { fields: Record<string, unknown>; ids: string[] }>();
  /** 저장에 성공한 뒤에야 결과에 싣기 위해 잠시 들고 있는 가격 변경 내역 */
  const pendingChanges = new Map<
    string,
    { id: string; name: string; before: number | null; after: number | null }
  >();

  for (const id of ids) {
    const row = rows.get(id);
    if (!row) {
      failed.push({
        id,
        name: "삭제된 상품",
        reason: "상품을 찾을 수 없습니다.",
      });
      continue;
    }

    // ---------- 이번 상품에 적용할 값 만들기 ----------
    let patch: Record<string, unknown>;
    let before: number | null = null;
    let after: number | null = null;

    if (action.kind === "price") {
      before = (row[action.plan.target] as number | null) ?? null;
      after = adjustPrice(before, action.plan);
      if (after === null) {
        // 기준값이 비어 있어 계산할 수 없는 경우 — 0원으로 덮어써 가격을 지워 버리지 않는다
        skipped.push({
          id,
          name: row.name,
          reason: "기준이 되는 값이 비어 있어 건너뛰었습니다.",
        });
        continue;
      }
      if (after === before) {
        skipped.push({
          id,
          name: row.name,
          reason: "바뀌는 값이 없어 건너뛰었습니다.",
        });
        continue;
      }
      patch = { [action.plan.target]: after };
    } else if (action.kind === "status") {
      patch = { status: action.value };
    } else if (action.kind === "category") {
      patch = { category_id: action.value };
    } else {
      patch = { is_featured: action.value };
    }

    // ---------- 단건 수정과 똑같은 검증 (상품 한 건씩) ----------
    let fields: Record<string, unknown>;
    try {
      fields = parseProductFields(patch, { partial: true });
      /**
       * 상태나 판매가를 실제로 건드리는 요청일 때만 "팔 수 있는 가격인가"를 따진다.
       *
       * 항상 따지면, 어쩌다 판매중인 채로 0원이 되어 버린 상품은 카테고리 이동이나
       * 추천 지정 같은 무관한 작업까지 전부 거절당한다 — 고칠 방법이 사라진다.
       * 이 검사의 목적은 "0원인 채로 스토어에 올라가는 것"을 막는 것이지
       * 이미 어긋난 상품을 손도 못 대게 만드는 것이 아니다.
       */
      if ("status" in fields || "price" in fields) {
        assertSellablePrice(
          (fields.status as string | undefined) ?? row.status,
          (fields.price as number | undefined) ?? row.price
        );
      }
    } catch (e) {
      if (e instanceof InputError) {
        failed.push({ id, name: row.name, reason: e.message });
        continue;
      }
      throw e;
    }

    const key = JSON.stringify(fields);
    const group = groups.get(key);
    if (group) group.ids.push(id);
    else groups.set(key, { fields, ids: [id] });

    if (action.kind === "price") pendingChanges.set(id, { id, name: row.name, before, after });
  }

  // ---------- 묶어서 저장 ----------
  let ok = 0;
  for (const group of groups.values()) {
    const { error: updateError } = await service
      .from("products")
      .update(group.fields)
      .in("id", group.ids);
    if (updateError) {
      console.error("[admin/products/bulk-edit] 수정 실패:", group.ids.length, updateError.message);
      for (const id of group.ids) {
        failed.push({
          id,
          name: rows.get(id)?.name ?? "이름을 알 수 없는 상품",
          reason: "저장 중 오류가 났습니다. 다시 시도해 주세요.",
        });
      }
      continue;
    }
    ok += group.ids.length;
    for (const id of group.ids) {
      const change = pendingChanges.get(id);
      if (change) changes.push(change);
    }
  }

  // 한 건이라도 실제로 바뀐 뒤에만 카탈로그 캐시를 비운다.
  // (기존 라우트와 같은 방식 — 목록/개수/상세/관련상품 캐시가 모두 이 태그에 걸려 있다.)
  if (ok > 0) revalidateTag(CACHE_TAGS.products, { expire: 0 });

  return NextResponse.json({ ok, failed, skipped, changes });
}
