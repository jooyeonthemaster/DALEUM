import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * 상품 조회수 증가 — 상품 상세 진입 시 클라이언트가 호출.
 * 집계 실패가 UX를 막으면 안 되므로 어떤 경우에도 200을 반환한다.
 * (read-then-write라 극단적 동시 조회에서 1~2회 어긋날 수 있음 — 허용)
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { productId?: unknown };
    const productId =
      typeof body.productId === "string" && UUID_RE.test(body.productId)
        ? body.productId
        : null;
    if (!productId) return NextResponse.json({ ok: true });

    const service = createServiceClient();
    const { data } = await service
      .from("products")
      .select("view_count")
      .eq("id", productId)
      .maybeSingle();
    if (data) {
      await service
        .from("products")
        .update({ view_count: ((data.view_count as number) ?? 0) + 1 })
        .eq("id", productId);
    }
  } catch {
    // 조회 집계 실패는 조용히 무시
  }
  return NextResponse.json({ ok: true });
}
