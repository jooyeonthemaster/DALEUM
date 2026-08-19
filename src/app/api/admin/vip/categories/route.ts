import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { jsonError } from "../_lib/validate";

/* ============================================================
   GET /api/admin/vip/categories
   상품 담기 화면의 분류 필터용 목록.

   왜 따로 두나: 상품 검색은 글자를 칠 때마다 호출되는데, 분류 목록은
   거의 바뀌지 않는다. 같은 응답에 실으면 매 타건마다 쓸데없이 한 번 더 읽는다.
   ============================================================ */

export async function GET() {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const { data, error } = await auth.service
    .from("categories")
    .select("id, name")
    .order("sort_order", { ascending: true })
    .limit(100);

  if (error) {
    console.error("[admin/vip/categories]", error.message);
    return jsonError("분류 목록을 불러오지 못했습니다.", 500);
  }

  return NextResponse.json({ categories: data ?? [] });
}
