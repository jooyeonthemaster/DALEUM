import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { isUuid } from "@/lib/orders";
import { CACHE_TAGS } from "@/lib/cache";
import { INVENTORY_PRODUCT_SELECT, buildInventoryRows, type RawProduct } from "../shared";
import { InputError, assertSellablePrice } from "@/app/api/admin/products/shared";

/* ============================================================
   POST /api/admin/inventory/status — 판매 상태를 재고에 맞춘다
   body: { productId }

   왜 이 창구가 필요한가:
   재고를 0으로 만들어도, 반대로 품절 상품에 100개를 입고해도 판매 상태는 그대로다.
   (재고 증감 함수는 수량과 이력만 건드리고 products.status 는 손대지 않는다)
   그 결과 "재고 100개인데 고객 화면은 계속 일시품절" 같은 일이 조용히 생긴다.
   자동으로 상태를 뒤집으면 관리자가 일부러 내려둔 상품까지 되살아나므로,
   화면에서 어긋난 것을 보여 주고 관리자가 눌렀을 때만 맞춘다.
   ============================================================ */

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const { service } = auth;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || !isUuid(body.productId)) {
    return NextResponse.json({ error: "상품 정보가 올바르지 않습니다." }, { status: 400 });
  }
  const productId = body.productId;

  // 판매가를 함께 읽는다 — 판매중으로 되돌릴 때 0원 상품인지 봐야 한다
  const { data, error } = await service
    .from("products")
    .select(`${INVENTORY_PRODUCT_SELECT}, price`)
    .eq("id", productId)
    .maybeSingle();

  if (error) {
    console.error("[admin/inventory/status] 조회 실패:", error.message);
    return NextResponse.json({ error: "상품을 불러오지 못했습니다." }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "상품을 찾을 수 없습니다." }, { status: 404 });
  }

  // 판정은 목록과 같은 함수를 쓴다 — 화면이 "어긋남"이라 표시한 것과 다른 결론이 나면 안 된다
  const row = buildInventoryRows([data as unknown as RawProduct])[0];
  if (!row || row.status_mismatch === null) {
    return NextResponse.json({
      ok: true,
      changed: false,
      message: "판매 상태가 이미 재고와 맞습니다.",
    });
  }

  const next = row.status_mismatch === "empty_but_selling" ? "sold_out" : "active";

  // 판매가 0원 상품은 판매중이 될 수 없다.
  // 상품 저장 API 와 목록 일괄 수정은 이미 이 검사를 거치는데 이 창구만 빠져 있었다 —
  // 재고 화면의 '맞추기' 한 번으로 값도 없는 상품이 고객 화면에 0원으로 걸릴 수 있었다.
  if (next === "active") {
    try {
      assertSellablePrice(next, (data as { price?: unknown }).price);
    } catch (e) {
      if (e instanceof InputError) {
        return NextResponse.json({ error: e.message }, { status: 400 });
      }
      throw e;
    }
  }

  const { error: updateError } = await service
    .from("products")
    .update({ status: next })
    .eq("id", productId);

  if (updateError) {
    console.error("[admin/inventory/status] 상태 변경 실패:", updateError.message);
    return NextResponse.json({ error: "판매 상태를 바꾸지 못했습니다." }, { status: 500 });
  }

  // 판매 상태는 고객 화면에 바로 보이는 값이라 캐시를 즉시 만료시킨다
  revalidateTag(CACHE_TAGS.products, { expire: 0 });

  return NextResponse.json({
    ok: true,
    changed: true,
    status: next,
    message:
      next === "sold_out"
        ? `'${row.name}' 을 품절로 바꿨습니다.`
        : `'${row.name}' 을 판매중으로 바꿨습니다.`,
  });
}
