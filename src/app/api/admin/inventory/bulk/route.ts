import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { cleanStr } from "@/lib/orders";
import { CACHE_TAGS } from "@/lib/cache";
import { INVENTORY_PRODUCT_SELECT, adjustStockRpc, type RawProduct } from "../shared";
import { batchMark, isSafeBatchId, markPattern, withMark } from "../marks";
import { buildMatchIndex, resolveTarget } from "./match";

/* ============================================================
   POST /api/admin/inventory/bulk — 엑셀 일괄 입고 · 실사 반영

   왜 서버에서 짝을 맞추는가:
   화면이 가진 목록은 페이지 단위라 20개뿐이다. 엑셀에는 37줄이 들어오므로 화면 목록으로
   짝을 맞추면 "안 보이는 페이지의 품목"이 전부 실패로 뜬다. 그래서 여기서 전량을 읽어 맞춘다.
   짝 맞추기 규칙 자체는 ./match.ts 에 있다.

   dryRun 을 둔 이유:
   미리보기와 확정이 서로 다른 규칙으로 판단하면 "미리보기에서는 되던 것이 확정에서 실패"한다.
   같은 함수에 dryRun 만 다르게 줘서 두 단계가 절대 어긋나지 않게 했다.

   처리 식별자(batchId)를 받는 이유:
   재고 증감은 절대값이 아니라 증감이다. 반영 도중 응답을 못 받아 실패처럼 보일 때 관리자가
   다시 누르면 같은 수량이 그대로 한 번 더 들어간다(이중 입고). 그래서 한 묶음마다 식별자를
   받아 이력 메모에 표식으로 남기고, 같은 식별자가 이미 남아 있으면 두 번째 실행을 거절한다.
   ============================================================ */

const MAX_ROWS = 500;

interface IncomingRow {
  no?: unknown;
  sku?: unknown;
  productName?: unknown;
  optionName?: unknown;
  /** 입고 수량 (양수) */
  restock?: unknown;
  /** 창고에서 실제로 세어 본 재고 */
  count?: unknown;
  /** 엑셀을 내려받던 시점의 현재고 — 실사 반영이 남의 판매를 덮어쓰지 않게 대조한다 */
  current?: unknown;
  memo?: unknown;
}

export interface BulkStockResult {
  no: number;
  label: string;
  /** restock=입고 / count=실사 반영 / skip=건너뜀 / error=실패 */
  kind: "restock" | "count" | "skip" | "error";
  before: number | null;
  after: number | null;
  delta: number | null;
  message: string;
}

/** 엑셀 칸에서 정수 꺼내기 — "1,000" · "1000개" · 공백 모두 흡수한다 */
function toIntCell(v: unknown): number | null | "invalid" {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isInteger(v) ? v : "invalid";
  if (typeof v !== "string") return "invalid";
  const t = v.replace(/[,\s 　개원]/g, "");
  if (!t) return null;
  if (!/^-?\d+$/.test(t)) return "invalid";
  return parseInt(t, 10);
}

function cellText(v: unknown): string {
  return typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "";
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const { service } = auth;

  const body = (await req.json().catch(() => null)) as
    | { dryRun?: unknown; memo?: unknown; rows?: unknown; batchId?: unknown }
    | null;
  if (!body || !Array.isArray(body.rows)) {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }
  const rows = body.rows as IncomingRow[];
  if (rows.length === 0) {
    return NextResponse.json({ error: "처리할 내용이 없습니다." }, { status: 400 });
  }
  if (rows.length > MAX_ROWS) {
    return NextResponse.json(
      { error: `한 번에 처리할 수 있는 줄은 ${MAX_ROWS}줄까지입니다.` },
      { status: 400 }
    );
  }
  const dryRun = body.dryRun === true;
  const commonMemo = cleanStr(body.memo, 200);
  const batchId = isSafeBatchId(body.batchId) ? body.batchId : null;
  const mark = batchId ? batchMark(batchId) : null;

  /* ---------- 이미 반영한 묶음인가 ---------- */
  // 관리자가 '반영'을 두 번 눌렀거나, 첫 번째 응답만 유실된 경우다.
  // 이력에 표식이 남아 있으면 그 묶음은 이미 재고에 들어갔다 — 다시 넣지 않는다.
  if (!dryRun && mark) {
    const { data: done, error: doneError } = await service
      .from("inventory_logs")
      .select("id")
      .ilike("memo", markPattern(mark))
      .limit(1);
    if (doneError) {
      console.error("[admin/inventory/bulk] 중복 확인 실패:", doneError.message);
      return NextResponse.json(
        { error: "이미 반영된 내용인지 확인하지 못했습니다. 목록에서 현재고를 확인한 뒤 다시 시도해 주세요." },
        { status: 500 }
      );
    }
    if ((done ?? []).length > 0) {
      return NextResponse.json({
        dryRun: false,
        alreadyApplied: true,
        results: [],
        summary: { applied: 0, skipped: 0, failed: 0, total: rows.length },
        message:
          "이 엑셀은 이미 재고에 반영됐습니다. 같은 수량을 두 번 넣지 않았습니다. 목록에서 현재고를 확인해 주세요.",
      });
    }
  }

  const { data, error } = await service
    .from("products")
    .select(INVENTORY_PRODUCT_SELECT)
    .limit(1000);
  if (error) {
    console.error("[admin/inventory/bulk] 상품 조회 실패:", error.message);
    return NextResponse.json({ error: "상품 목록을 불러오지 못했습니다." }, { status: 500 });
  }
  const products = (data ?? []) as unknown as RawProduct[];

  const index = buildMatchIndex(products);
  // 세는 사이에 팔렸는지 대조할 기준 — 이 요청이 스스로 바꾼 수량과 섞이면 안 되므로 따로 떠 둔다
  const dbStock = new Map(index.stockOf);

  /* ---------- 줄별 처리 ---------- */
  const results: BulkStockResult[] = [];
  let applied = 0;
  let failed = 0;
  let skipped = 0;

  for (let i = 0; i < rows.length; i += 1) {
    const raw = rows[i];
    const no = typeof raw.no === "number" && Number.isFinite(raw.no) ? raw.no : i + 1;
    const sku = cellText(raw.sku);
    const productName = cellText(raw.productName);
    const optionName = cellText(raw.optionName);
    const fallbackLabel =
      [productName, optionName].filter(Boolean).join(" — ") || sku || `${no}번째 줄`;

    const fail = (message: string) => {
      results.push({ no, label: fallbackLabel, kind: "error", before: null, after: null, delta: null, message });
      failed += 1;
    };
    const skip = (label: string, message: string, before: number | null) => {
      results.push({ no, label, kind: "skip", before, after: before, delta: 0, message });
      skipped += 1;
    };

    /* 1) 어느 품목인가 */
    const matched = resolveTarget(index, { sku, productName, optionName, fallbackLabel });
    if (!matched.ok) {
      fail(matched.message);
      continue;
    }
    const target = matched.target;

    /* 2) 얼마나 바꾸는가 */
    const restock = toIntCell(raw.restock);
    const count = toIntCell(raw.count);
    const before = index.stockOf.get(target.key) ?? 0;

    if (restock === "invalid" || count === "invalid") {
      fail("수량은 숫자로만 적어 주세요.");
      continue;
    }
    if (restock !== null && count !== null) {
      fail("한 줄에 입고 수량과 실제 재고를 함께 적을 수 없습니다. 하나만 남겨 주세요.");
      continue;
    }

    let delta: number;
    let reason: "restock" | "adjust";
    let kind: "restock" | "count";

    if (restock !== null) {
      if (restock <= 0) {
        fail("입고 수량은 1 이상으로 적어 주세요. 줄이려면 실제 재고 칸을 쓰세요.");
        continue;
      }
      if (restock > 100000) {
        fail("한 번에 입고할 수 있는 수량은 100,000개까지입니다.");
        continue;
      }
      delta = restock;
      reason = "restock";
      kind = "restock";
    } else if (count !== null) {
      if (count < 0) {
        fail("실제 재고는 0 이상으로 적어 주세요.");
        continue;
      }
      if (count > 1000000) {
        fail("한 품목의 재고는 1,000,000개를 넘을 수 없습니다.");
        continue;
      }

      // 실사 반영은 '세어 온 수량으로 덮어쓰기'다. 세는 동안 주문이 나갔다면 그 판매까지
      // 없던 일로 만들어 초과판매가 된다. 양식에 찍혀 있던 현재고와 지금 값이 다르면 손대지 않는다.
      const sheetCurrent = toIntCell(raw.current);
      const originalStock = dbStock.get(target.key) ?? 0;
      if (typeof sheetCurrent === "number" && sheetCurrent !== originalStock) {
        const moved = sheetCurrent - originalStock;
        fail(
          moved > 0
            ? `세는 사이에 ${moved}개가 나가 지금 재고는 ${originalStock}개입니다(양식에는 ${sheetCurrent}개). 그 판매를 지우지 않으려고 반영하지 않았습니다. 엑셀을 다시 내려받아 적어 주세요.`
            : `세는 사이에 재고가 ${sheetCurrent}개에서 ${originalStock}개로 바뀌어 반영하지 않았습니다. 엑셀을 다시 내려받아 적어 주세요.`
        );
        continue;
      }

      delta = count - before;
      reason = "adjust";
      kind = "count";
      if (delta === 0) {
        skip(target.label, "장부와 수량이 같아 그대로 두었습니다.", before);
        continue;
      }
    } else {
      skip(target.label, "수량이 비어 있어 건너뛰었습니다.", before);
      continue;
    }

    if (before + delta < 0) {
      results.push({
        no,
        label: target.label,
        kind: "error",
        before,
        after: null,
        delta,
        message: `재고가 ${before}개라 ${Math.abs(delta)}개를 뺄 수 없습니다.`,
      });
      failed += 1;
      continue;
    }

    /* 3) 실행 (미리보기면 계산만) */
    if (!dryRun) {
      const written =
        cleanStr(raw.memo, 200) ?? commonMemo ?? (kind === "restock" ? "엑셀 일괄 입고" : "엑셀 실사 반영");
      // 표식은 사람이 읽을 말이 아니다 — 화면·엑셀은 stripMarks() 로 지우고 보여 준다
      const memo = mark ? withMark(written, mark) : written;
      const res = await adjustStockRpc(service, {
        productId: target.productId,
        variantId: target.variantId,
        delta,
        reason,
        memo,
      });
      if (!res.ok) {
        results.push({
          no,
          label: target.label,
          kind: "error",
          before,
          after: null,
          delta,
          message: res.message,
        });
        failed += 1;
        continue;
      }
    }

    // 같은 품목이 여러 줄에 나올 수 있다. 장부 수량을 누적해 두지 않으면
    // 두 번째 줄의 "현재고 → 변경 후"가 첫 줄을 반영하지 못해 미리보기가 거짓말을 한다.
    index.stockOf.set(target.key, before + delta);
    results.push({
      no,
      label: target.label,
      kind,
      before,
      after: before + delta,
      delta,
      message: kind === "restock" ? "입고" : "실사 반영",
    });
    applied += 1;
  }

  // 실제로 반영한 경우에만 카탈로그 캐시를 비운다 (미리보기로 캐시를 흔들 이유가 없다)
  if (!dryRun && applied > 0) {
    revalidateTag(CACHE_TAGS.products, { expire: 0 });
  }

  return NextResponse.json({
    dryRun,
    results,
    summary: { applied, skipped, failed, total: rows.length },
  });
}
