import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";

/**
 * GET /api/admin/bulk-inquiries?status=new&q=… — 견적 문의 목록
 *
 * 고객 폼은 관심 품목을 상품 주소(slug)로만 저장한다(bulk_inquiries.product_slugs).
 * 그 값을 그대로 내려보내면 관리자 화면에 `konjac-rice-500g` 같은 주소 조각이 찍힌다.
 * 대표가 읽어야 하는 것은 상품명이므로 **여기서 상품 테이블과 맞춰 이름으로 바꿔** 내려보낸다.
 * 지워졌거나 이름이 바뀐 상품은 한국어 폴백으로 채운다 — 화면이 빈칸이 되면
 * 거래처가 무엇에 관심 있었는지 영영 알 수 없다.
 */

interface InquiryRow {
  id: string;
  product_slugs: string[] | null;
  status: string;
  [key: string]: unknown;
}

interface ImageRow {
  url: string;
  sort_order: number;
  is_primary: boolean;
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const { service } = auth;

  const sp = req.nextUrl.searchParams;
  const status = sp.get("status");
  const q = sp.get("q")?.replace(/[,()]/g, "").trim().slice(0, 50);

  let query = service
    .from("bulk_inquiries")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .limit(200);

  if (status && status !== "all") query = query.eq("status", status);
  if (q) query = query.or(`company.ilike.%${q}%,contact_name.ilike.%${q}%,email.ilike.%${q}%`);

  const { data, error, count } = await query;
  if (error) {
    // Supabase 원문(영문 DB 오류)을 화면에 그대로 뿌리면 대표는 자기 잘못인지조차 판단할 수 없다.
    // 원문은 서버 로그로만 남기고 화면에는 사람 말로 답한다.
    console.error("[admin/bulk-inquiries] 목록 조회 실패:", error.message);
    return NextResponse.json(
      { error: "문의 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요." },
      { status: 500 }
    );
  }

  const rows = (data ?? []) as InquiryRow[];

  // ---------- 관심 품목 주소 → 상품명 ----------
  const slugs = [...new Set(rows.flatMap((r) => r.product_slugs ?? []))];
  const bySlug = new Map<string, { id: string; name: string; thumbnail: string | null }>();

  if (slugs.length > 0) {
    const { data: products, error: productError } = await service
      .from("products")
      .select("id, name, slug, product_images(url, sort_order, is_primary)")
      .in("slug", slugs);

    if (productError) {
      // 이름을 못 붙여도 문의 목록 자체는 보여주는 편이 낫다 — 폴백 문구로 대신한다.
      console.error("[admin/bulk-inquiries] 관심 품목 상품명 조회 실패:", productError.message);
    }

    for (const p of (products ?? []) as {
      id: string;
      name: string;
      slug: string;
      product_images: ImageRow[] | null;
    }[]) {
      const images = [...(p.product_images ?? [])].sort(
        (a, b) => Number(b.is_primary) - Number(a.is_primary) || a.sort_order - b.sort_order
      );
      bySlug.set(p.slug, { id: p.id, name: p.name, thumbnail: images[0]?.url ?? null });
    }
  }

  const inquiries = rows.map((r) => ({
    ...r,
    items: (r.product_slugs ?? []).map((slug) => {
      const found = bySlug.get(slug);
      return {
        id: found?.id ?? null,
        name: found?.name ?? "판매 종료 상품",
        thumbnail: found?.thumbnail ?? null,
      };
    }),
  }));

  // 상태별 건수 — 탭 배지용
  const { data: allRows, error: countError } = await service
    .from("bulk_inquiries")
    .select("status");
  if (countError) {
    console.error("[admin/bulk-inquiries] 상태별 건수 집계 실패:", countError.message);
  }
  const counts: Record<string, number> = {};
  for (const r of (allRows ?? []) as { status: string }[]) {
    counts[r.status] = (counts[r.status] ?? 0) + 1;
  }

  return NextResponse.json({ inquiries, total: count ?? 0, counts });
}
