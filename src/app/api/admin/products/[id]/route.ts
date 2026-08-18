import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { CACHE_TAGS } from "@/lib/cache";
import { isUuid } from "@/lib/orders";
import {
  InputError,
  parseImages,
  parseProductFields,
  parseVariants,
} from "../shared";

/* ============================================================
   GET    /api/admin/products/[id] — 단건 조회 (+ 주문 이력 여부)
   PATCH  /api/admin/products/[id] — 수정 (이미지 교체 / 옵션 동기화)
   DELETE /api/admin/products/[id] — 삭제 (주문 이력 없을 때만)
   ============================================================ */

const PRODUCT_SELECT =
  "*, product_images(id, url, alt, sort_order, is_primary), categories(id, slug, name), product_variants(id, name, price_delta, stock, sku, is_active, sort_order)";

type RouteParams = { params: Promise<{ id: string }> };

interface VariantRow {
  id: string;
  stock: number;
}

function notFound() {
  return NextResponse.json({ error: "상품을 찾을 수 없습니다." }, { status: 404 });
}

/** GET → { product, hasOrders } */
export async function GET(_req: NextRequest, { params }: RouteParams) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const { service } = auth;

  const { id } = await params;
  if (!isUuid(id)) return notFound();

  const { data: product, error } = await service
    .from("products")
    .select(PRODUCT_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) {
    console.error("[admin/products] 조회 실패:", error.message);
    return NextResponse.json({ error: "상품을 불러오지 못했습니다." }, { status: 500 });
  }
  if (!product) return notFound();

  // 정렬 보장 (nested order 대신 서버에서 정렬)
  (product.product_images as { sort_order: number }[] | null)?.sort(
    (a, b) => a.sort_order - b.sort_order
  );
  (product.product_variants as { sort_order: number }[] | null)?.sort(
    (a, b) => a.sort_order - b.sort_order
  );

  const { count } = await service
    .from("order_items")
    .select("id", { count: "exact", head: true })
    .eq("product_id", id);

  return NextResponse.json({ product, hasOrders: (count ?? 0) > 0 });
}

/**
 * PATCH body: { product?: {...}, images?: [{url, alt?}], variants?: [{id?, ...}] }
 * - product.stock은 무시 (재고는 재고 관리 화면에서 adjust_stock 경유)
 * - images 전달 시 전체 교체
 * - variants 전달 시 동기화: id 있으면 수정(재고 변경은 adjust 로그),
 *   id 없으면 추가(initial 로그), 목록에서 빠진 기존 옵션은 삭제
 */
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const { service, user } = auth;

  const { id } = await params;
  if (!isUuid(id)) return notFound();

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });

  let fields: Record<string, unknown>;
  let images: ReturnType<typeof parseImages>;
  let variants: ReturnType<typeof parseVariants>;
  try {
    fields = parseProductFields(body.product ?? {}, { partial: true });
    images = parseImages(body.images);
    variants = parseVariants(body.variants);
  } catch (e) {
    if (e instanceof InputError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    throw e;
  }
  // 재고는 편집 폼에서 직접 수정 불가 — 재고 관리 화면 경유
  delete fields.stock;

  const { data: existing } = await service
    .from("products")
    .select("id, name")
    .eq("id", id)
    .maybeSingle();
  if (!existing) return notFound();

  // slug/SKU 중복 (본인 제외)
  if (fields.slug) {
    const { data: dup } = await service
      .from("products")
      .select("id")
      .eq("slug", fields.slug as string)
      .neq("id", id)
      .maybeSingle();
    if (dup) {
      return NextResponse.json({ error: "이미 사용 중인 URL 슬러그입니다." }, { status: 400 });
    }
  }
  if (fields.sku) {
    const { data: dup } = await service
      .from("products")
      .select("id")
      .eq("sku", fields.sku as string)
      .neq("id", id)
      .maybeSingle();
    if (dup) {
      return NextResponse.json({ error: "이미 사용 중인 SKU입니다." }, { status: 400 });
    }
  }

  if (Object.keys(fields).length > 0) {
    const { error } = await service.from("products").update(fields).eq("id", id);
    if (error) {
      if (error.code === "23505") {
        return NextResponse.json(
          { error: "이미 사용 중인 슬러그 또는 SKU입니다." },
          { status: 400 }
        );
      }
      console.error("[admin/products] 수정 실패:", error.message);
      return NextResponse.json({ error: "상품 수정에 실패했습니다." }, { status: 500 });
    }
  }

  const warnings: string[] = [];

  // ---------- 이미지 전체 교체 ----------
  if (images !== undefined) {
    const { error: delError } = await service
      .from("product_images")
      .delete()
      .eq("product_id", id);
    if (delError) {
      warnings.push("기존 이미지 정리에 실패했습니다.");
    } else if (images.length > 0) {
      const productName = (fields.name as string | undefined) ?? existing.name;
      const { error } = await service.from("product_images").insert(
        images.map((img, i) => ({
          product_id: id,
          url: img.url,
          alt: img.alt ?? productName,
          sort_order: i,
          is_primary: i === 0,
        }))
      );
      if (error) warnings.push("이미지 저장에 실패했습니다.");
    }
  }

  // ---------- 옵션 동기화 ----------
  if (variants !== undefined) {
    const { data: currentRows } = await service
      .from("product_variants")
      .select("id, stock")
      .eq("product_id", id);
    const current = new Map<string, VariantRow>(
      ((currentRows ?? []) as VariantRow[]).map((r) => [r.id, r])
    );
    const keepIds = new Set<string>();
    const initialLogs: Record<string, unknown>[] = [];

    for (const [i, v] of variants.entries()) {
      if (v.id && current.has(v.id)) {
        // 기존 옵션 수정 — 재고 외 필드는 직접 update, 재고 차이는 adjust_stock 경유
        keepIds.add(v.id);
        const prev = current.get(v.id)!;
        const { error } = await service
          .from("product_variants")
          .update({
            name: v.name,
            price_delta: v.price_delta,
            sku: v.sku,
            is_active: v.is_active,
            sort_order: i,
          })
          .eq("id", v.id);
        if (error) {
          warnings.push(`옵션 수정 실패: ${v.name}`);
          continue;
        }
        const delta = v.stock - prev.stock;
        if (delta !== 0) {
          const { error: rpcError } = await service.rpc("adjust_stock", {
            p_product_id: id,
            p_variant_id: v.id,
            p_delta: delta,
            p_reason: "adjust",
            p_ref_order_id: null,
            p_memo: "상품 편집 화면에서 조정",
          });
          if (rpcError) warnings.push(`옵션 재고 조정 실패: ${v.name}`);
        }
      } else {
        // 신규 옵션 추가
        const { data: nv, error } = await service
          .from("product_variants")
          .insert({
            product_id: id,
            name: v.name,
            price_delta: v.price_delta,
            stock: v.stock,
            sku: v.sku,
            is_active: v.is_active,
            sort_order: i,
          })
          .select("id, stock")
          .single();
        if (error || !nv) {
          warnings.push(`옵션 추가 실패: ${v.name}`);
          continue;
        }
        if (nv.stock > 0) {
          initialLogs.push({
            product_id: id,
            variant_id: nv.id,
            delta: nv.stock,
            reason: "initial",
            memo: `옵션 신규 등록 (${v.name})`,
            created_by: user.id,
          });
        }
      }
    }

    // 목록에서 빠진 기존 옵션 삭제
    const toDelete = [...current.keys()].filter((vid) => !keepIds.has(vid));
    if (toDelete.length > 0) {
      const { error } = await service.from("product_variants").delete().in("id", toDelete);
      if (error) warnings.push("일부 옵션 삭제에 실패했습니다.");
    }

    if (initialLogs.length > 0) {
      const { error } = await service.from("inventory_logs").insert(initialLogs);
      if (error) warnings.push("옵션 최초 재고 이력 기록에 실패했습니다.");
    }
  }

  const { data: refreshed } = await service
    .from("products")
    .select(PRODUCT_SELECT)
    .eq("id", id)
    .maybeSingle();

  // 여기까지 왔다면 상품 본문/이미지/옵션 중 하나 이상이 실제로 반영된 뒤다
  // (본문 update 가 실패하는 경로는 위에서 이미 500 으로 빠져나간다).
  revalidateTag(CACHE_TAGS.products, { expire: 0 });

  return NextResponse.json({
    product: refreshed,
    ...(warnings.length ? { warning: warnings.join(" ") } : {}),
  });
}

/** DELETE — 주문 이력이 있으면 409 (숨김 처리 권장) */
export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const { service } = auth;

  const { id } = await params;
  if (!isUuid(id)) return notFound();

  const { count } = await service
    .from("order_items")
    .select("id", { count: "exact", head: true })
    .eq("product_id", id);
  if ((count ?? 0) > 0) {
    return NextResponse.json(
      { error: "주문 이력이 있는 상품은 삭제할 수 없습니다. 상태를 '숨김'으로 변경해 주세요." },
      { status: 409 }
    );
  }

  const { error } = await service.from("products").delete().eq("id", id);
  if (error) {
    console.error("[admin/products] 삭제 실패:", error.message);
    return NextResponse.json({ error: "상품 삭제에 실패했습니다." }, { status: 500 });
  }

  // 삭제 성공 — 목록/개수/상세/관련상품 캐시가 모두 이 태그에 걸려 있다.
  revalidateTag(CACHE_TAGS.products, { expire: 0 });

  return NextResponse.json({ ok: true });
}
