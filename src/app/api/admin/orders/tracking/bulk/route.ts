import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { CARRIERS, getCarrier, isValidTrackingNo, normalizeTrackingNo } from "@/lib/constants";
import { EVENT_KINDS, adminDisplayName } from "../../order-log";
import { appendOrderEvent } from "../../order-memo";

/**
 * POST /api/admin/orders/tracking/bulk — 운송장 번호 일괄 등록.
 * body: { rows: [{ orderNo, carrier, trackingNo }], commit?: boolean }
 *
 * 왜 필요한가:
 * 택배사에 발송을 접수하면 운송장 번호가 엑셀로 회신된다. 그런데 저장 경로가 주문 한 건씩
 * PATCH 하나뿐이라, 하루 100건이면 '목록 → 주문 클릭 → 택배사 선택 → 번호 입력 → 등록 → 뒤로'
 * 를 100번 반복해야 했다. 그 반복 중 한 줄만 밀려도 고객이 남의 배송을 조회한다.
 *
 * commit 없이 부르면 **검사만** 하고 행별 결과를 돌려준다(미리보기). commit=true 일 때만 반영한다.
 * 반영은 단건 등록과 같은 규칙을 따른다 — 결제완료·준비중 주문은 배송중으로 자동 전환되고,
 * 배송완료 이후로는 역행하지 않는다.
 */

const MAX_ROWS = 500;
const BLOCKED_STATUSES = ["cancelled", "refunded"];
const AUTO_SHIP_FROM = ["paid", "preparing"];

const CARRIER_NAMES = CARRIERS.map((c) => c.name).join(", ");

export interface BulkTrackingResult {
  line: number;
  orderNo: string;
  carrierName: string;
  trackingNo: string;
  ok: boolean;
  /** 실패 사유 또는 성공 시 부가 안내 (전부 한국어) */
  reason: string;
  applied: boolean;
}

/**
 * 엑셀에 적힌 택배사 표기를 지원 택배사로 옮긴다 — 공백·괄호·대소문자 차이는 무시한다.
 * 실무 파일에는 '한진', '롯데', 'CJ' 처럼 줄여 쓴 표기가 흔해서 부분 일치도 받아 준다.
 * 다만 '택배' 처럼 여러 곳에 걸리는 말은 엉뚱한 택배사에 붙을 수 있으니
 * **딱 하나로 좁혀질 때만** 인정한다.
 */
function matchCarrier(raw: string) {
  const key = raw.replace(/[\s()·-]/g, "").toLowerCase();
  if (!key) return undefined;
  const flat = (name: string) => name.replace(/\s/g, "").toLowerCase();
  const exact =
    CARRIERS.find((c) => c.code.toLowerCase() === key) ??
    CARRIERS.find((c) => flat(c.name) === key) ??
    getCarrier(raw);
  if (exact) return exact;
  const partial = CARRIERS.filter((c) => flat(c.name).includes(key) || key.includes(flat(c.name)));
  return partial.length === 1 ? partial[0] : undefined;
}

function text(v: unknown, max = 60): string {
  return typeof v === "string" ? v.trim().slice(0, max) : typeof v === "number" ? String(v) : "";
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const { service, user } = auth;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const rawRows = Array.isArray(body.rows) ? body.rows : null;
  if (!rawRows || rawRows.length === 0) {
    return NextResponse.json(
      { error: "읽을 내용이 없습니다. 주문번호·택배사·운송장번호가 담긴 파일인지 확인해 주세요." },
      { status: 400 }
    );
  }
  if (rawRows.length > MAX_ROWS) {
    return NextResponse.json(
      { error: `한 번에 ${MAX_ROWS}건까지 올릴 수 있습니다. 파일을 나눠 올려 주세요.` },
      { status: 400 }
    );
  }
  const commit = body.commit === true;

  // ---------- 입력 정리 ----------
  const parsed = rawRows.map((r, i) => {
    const row = (r ?? {}) as Record<string, unknown>;
    return {
      line: i + 1,
      orderNo: text(row.orderNo, 40),
      carrierRaw: text(row.carrier, 40),
      trackingRaw: normalizeTrackingNo(text(row.trackingNo, 40)),
    };
  });

  const orderNos = [...new Set(parsed.map((p) => p.orderNo).filter(Boolean))];
  const { data: orders, error } = await service
    .from("orders")
    .select("id, order_no, status, shipments(id, carrier_code, tracking_no, status, shipped_at)")
    .in("order_no", orderNos.length > 0 ? orderNos : ["-"]);

  if (error) {
    console.error("[admin/orders/tracking/bulk] 주문 조회 실패:", error.message);
    return NextResponse.json({ error: "주문을 불러오지 못했습니다." }, { status: 500 });
  }

  const byOrderNo = new Map(
    (orders ?? []).map((o) => [o.order_no as string, o as Record<string, unknown>])
  );
  const seen = new Map<string, number>();
  const results: BulkTrackingResult[] = [];
  const author = commit ? await adminDisplayName(service, user.id) : "";

  for (const row of parsed) {
    const base = {
      line: row.line,
      orderNo: row.orderNo,
      carrierName: "",
      trackingNo: row.trackingRaw,
      applied: false,
    };

    // 택배사는 어떤 실패로 끝나든 화면에 보여야 한다 — "내가 뭘 적었더라" 를
    // 파일에서 다시 찾게 만들지 않는다
    const carrier = matchCarrier(row.carrierRaw);
    if (carrier) base.carrierName = carrier.name;

    if (!row.orderNo) {
      results.push({ ...base, ok: false, reason: "주문번호가 비어 있습니다." });
      continue;
    }
    const firstSeen = seen.get(row.orderNo);
    if (firstSeen) {
      results.push({
        ...base,
        ok: false,
        reason: `같은 주문번호가 ${firstSeen}번째 줄에도 있습니다. 한 주문에는 운송장 하나만 넣을 수 있습니다.`,
      });
      continue;
    }
    seen.set(row.orderNo, row.line);

    const order = byOrderNo.get(row.orderNo);
    if (!order) {
      results.push({ ...base, ok: false, reason: "이 주문번호를 찾을 수 없습니다." });
      continue;
    }
    if (BLOCKED_STATUSES.includes(order.status as string)) {
      results.push({ ...base, ok: false, reason: "취소·환불된 주문이라 운송장을 넣을 수 없습니다." });
      continue;
    }

    if (!carrier) {
      results.push({
        ...base,
        ok: false,
        reason: row.carrierRaw
          ? `'${row.carrierRaw}' 는 알 수 없는 택배사입니다. ${CARRIER_NAMES} 중 하나로 적어 주세요.`
          : `택배사 칸이 비어 있습니다. ${CARRIER_NAMES} 중 하나로 적어 주세요.`,
      });
      continue;
    }

    if (!row.trackingRaw) {
      results.push({ ...base, ok: false, reason: "운송장 번호가 비어 있습니다." });
      continue;
    }
    if (!isValidTrackingNo(carrier.code, row.trackingRaw)) {
      results.push({
        ...base,
        ok: false,
        reason: `${carrier.name} 운송장 번호 자릿수와 맞지 않습니다. 숫자만 다시 확인해 주세요.`,
      });
      continue;
    }

    const shipments = (order.shipments ?? []) as Record<string, unknown>[];
    const existing = shipments[0];
    if (existing && existing.tracking_no === row.trackingRaw && existing.carrier_code === carrier.code) {
      results.push({ ...base, ok: true, reason: "이미 같은 번호가 들어 있어 그대로 둡니다." });
      continue;
    }
    if (existing && !commit) {
      results.push({
        ...base,
        ok: true,
        reason: `이미 등록된 번호(${existing.tracking_no})를 이 번호로 바꿉니다.`,
      });
      continue;
    }

    if (!commit) {
      const willShip = AUTO_SHIP_FROM.includes(order.status as string);
      results.push({
        ...base,
        ok: true,
        reason: willShip ? "등록하면 배송중으로 바뀝니다." : "등록합니다.",
      });
      continue;
    }

    // ---------- 반영 ----------
    const now = new Date().toISOString();
    const payload = {
      carrier_code: carrier.code,
      carrier_name: carrier.name,
      tracking_no: row.trackingRaw,
      status: existing?.status === "delivered" ? "delivered" : "in_transit",
      shipped_at: (existing?.shipped_at as string | null) ?? now,
    };
    const saved = existing
      ? await service.from("shipments").update(payload).eq("id", existing.id as string).select("id")
      : await service
          .from("shipments")
          .insert({ order_id: order.id as string, ...payload })
          .select("id");

    if (saved.error) {
      console.error("[admin/orders/tracking/bulk] 저장 실패:", saved.error.message);
      results.push({ ...base, ok: false, reason: "저장하지 못했습니다. 잠시 후 다시 시도해 주세요." });
      continue;
    }

    let note = "운송장을 등록했습니다.";
    if (AUTO_SHIP_FROM.includes(order.status as string)) {
      const { data: claimed } = await service
        .from("orders")
        .update({ status: "shipped" })
        .eq("id", order.id as string)
        .eq("status", order.status as string)
        .select("id");
      if (claimed && claimed.length > 0) note = "운송장을 등록하고 배송중으로 바꿨습니다.";
    }

    // 이력은 자유 메모를 건드리지 않고 뒤에만 덧붙인다.
    // 직접 읽고 쓰면 그 사이 들어온 환불 이력을 통째로 덮어쓴다(order-memo.ts 주석 참고)
    await appendOrderEvent(service, order.id as string, {
      kind: EVENT_KINDS.tracking,
      author,
      body: `${carrier.name} ${row.trackingRaw} · 엑셀로 일괄 등록했습니다.`,
    });

    results.push({ ...base, ok: true, applied: true, reason: note });
  }

  const okCount = results.filter((r) => r.ok).length;
  return NextResponse.json({
    committed: commit,
    rows: results,
    summary: {
      total: results.length,
      ok: okCount,
      failed: results.length - okCount,
      applied: results.filter((r) => r.applied).length,
    },
  });
}
