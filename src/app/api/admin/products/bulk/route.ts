import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/auth";
import { CACHE_TAGS } from "@/lib/cache";
import {
  getCategoryLookup,
  normalizeRow,
  type CategoryLookup,
  type SizedImage,
} from "./row-normalize";
import { InputError, type ParsedImage, type ParsedVariant } from "../shared";

type BulkMode = "validate" | "create";

interface BulkResult {
  /**
   * 화면 카드의 고유 id. 화면은 배열 순번이 아니라 이 값으로 결과를 찾는다.
   * 순번으로 찾던 옛 방식은 이름이 빈 카드가 하나만 있어도 뒤의 모든 결과가
   * 한 칸씩 밀려, 멀쩡한 상품에 남의 오류가 붙었다.
   */
  client_id: string | null;
  row_no: number;
  name: string | null;
  ok: boolean;
  /** 이미 같은 주소로 등록돼 있어 건너뛴 행 — 재시도를 몇 번 해도 안전하게 만든다 */
  skipped?: boolean;
  product_id?: string;
  warnings: string[];
  errors: string[];
}

interface PreparedProduct {
  /** results 배열에서 이 행의 자리 */
  resultIndex: number;
  product: Record<string, unknown>;
  images: ParsedImage[];
  detailImages: SizedImage[];
  variants: ParsedVariant[];
}

const MAX_ROWS = 200;

/** 결과 문구에 쓸 상품 이름 — 코드값 대신 사람이 아는 이름을 쓴다 */
function displayName(result: BulkResult): string {
  return `'${result.name?.trim() || "이름 없는 상품"}'`;
}

async function validateUnique(
  service: SupabaseClient,
  prepared: PreparedProduct[],
  results: BulkResult[]
) {
  const slugMap = new Map<string, PreparedProduct[]>();
  const skuMap = new Map<string, PreparedProduct[]>();

  for (const item of prepared) {
    const slug = String(item.product.slug);
    slugMap.set(slug, [...(slugMap.get(slug) ?? []), item]);
    const sku = item.product.sku;
    if (typeof sku === "string" && sku.trim()) {
      skuMap.set(sku, [...(skuMap.get(sku) ?? []), item]);
    }
  }

  // 같은 양식 안에서 겹치는 경우 — 어느 상품끼리인지 이름으로 알려 준다
  for (const items of slugMap.values()) {
    if (items.length < 2) continue;
    const names = items.map((item) => displayName(results[item.resultIndex])).join(" 과 ");
    for (const item of items) {
      const result = results[item.resultIndex];
      result.ok = false;
      result.errors.push(`${names} 의 상품 주소가 같습니다. 한쪽 상품 주소를 바꿔 주세요.`);
    }
  }
  for (const items of skuMap.values()) {
    if (items.length < 2) continue;
    const names = items.map((item) => displayName(results[item.resultIndex])).join(" 과 ");
    for (const item of items) {
      const result = results[item.resultIndex];
      result.ok = false;
      result.errors.push(`${names} 의 상품 코드가 같습니다. 한쪽을 바꾸거나 비워 주세요.`);
    }
  }

  // 이미 DB 에 있는 주소 — 오류가 아니라 '건너뜀' 으로 다룬다.
  // 30개 중 22개가 등록된 뒤 8개를 고쳐 다시 보내는 것이 흔한 흐름인데,
  // 이걸 오류로 처리하면 이미 들어간 22개가 전부 빨갛게 떠서
  // 등록이 실패한 건지 중복이 생긴 건지 판단할 수 없었다.
  const slugs = [...slugMap.keys()];
  if (slugs.length > 0) {
    const { data } = await service.from("products").select("id, slug").in("slug", slugs);
    for (const row of (data ?? []) as { id: string; slug: string }[]) {
      for (const item of slugMap.get(row.slug) ?? []) {
        const result = results[item.resultIndex];
        result.skipped = true;
        result.product_id = row.id;
        result.warnings.push(
          `${displayName(result)} 은 이미 등록된 상품이라 건너뛰었습니다. 내용을 바꾸려면 기존 상품에서 수정해 주세요.`
        );
      }
    }
  }

  const skus = [...skuMap.keys()];
  if (skus.length > 0) {
    const { data } = await service.from("products").select("sku").in("sku", skus);
    for (const row of (data ?? []) as { sku: string | null }[]) {
      if (!row.sku) continue;
      for (const item of skuMap.get(row.sku) ?? []) {
        const result = results[item.resultIndex];
        if (result.skipped) continue; // 이미 등록된 상품이면 코드가 같은 게 당연하다
        result.ok = false;
        result.errors.push(
          `${displayName(result)} 의 상품 코드는 다른 상품이 이미 쓰고 있습니다. 다른 코드를 넣거나 비워 주세요.`
        );
      }
    }
  }
}

async function createOne(
  service: SupabaseClient,
  userId: string,
  item: PreparedProduct,
  result: BulkResult
) {
  const { data: created, error: insertError } = await service
    .from("products")
    .insert(item.product)
    .select("id")
    .single();

  if (insertError || !created) {
    result.ok = false;
    result.errors.push(
      insertError?.code === "23505"
        ? "같은 상품 주소나 상품 코드를 쓰는 상품이 이미 있습니다."
        : "상품을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요."
    );
    return;
  }

  result.product_id = created.id as string;

  if (item.images.length > 0) {
    const { error } = await service.from("product_images").insert(
      item.images.map((img, index) => ({
        product_id: created.id,
        url: img.url,
        alt: img.alt ?? item.product.name,
        sort_order: index,
        is_primary: index === 0,
      }))
    );
    if (error) result.warnings.push("상품 사진을 저장하지 못했습니다. 상품 수정 화면에서 다시 올려 주세요.");
  }
  // 사진 없음 안내는 여기서 하지 않는다 — 행을 읽는 자리(아래 normalizeRow 뒤)에서 한 번만 붙인다.
  // 두 곳에서 각각 붙였더니 같은 말이 카드마다 두 번 떠서, 사람이 서로 다른 문제 둘로 읽었다.

  let insertedVariants: { id: string; name: string; stock: number }[] = [];
  if (item.variants.length > 0) {
    const { data, error } = await service
      .from("product_variants")
      .insert(
        item.variants.map((variant, index) => ({
          product_id: created.id,
          name: variant.name,
          price_delta: variant.price_delta,
          stock: variant.stock,
          sku: variant.sku,
          is_active: variant.is_active,
          sort_order: index,
        }))
      )
      .select("id, name, stock");
    if (error) result.warnings.push("옵션을 저장하지 못했습니다. 상품 수정 화면에서 다시 넣어 주세요.");
    insertedVariants = (data ?? []) as { id: string; name: string; stock: number }[];
  }

  const logs: Record<string, unknown>[] = [];
  const stock = Number(item.product.stock ?? 0);
  if (stock > 0) {
    logs.push({
      product_id: created.id,
      variant_id: null,
      delta: stock,
      reason: "initial",
      memo: "일괄 상품 등록",
      created_by: userId,
    });
  }
  for (const variant of insertedVariants) {
    if (variant.stock > 0) {
      logs.push({
        product_id: created.id,
        variant_id: variant.id,
        delta: variant.stock,
        reason: "initial",
        memo: `일괄 옵션 등록 (${variant.name})`,
        created_by: userId,
      });
    }
  }
  if (logs.length > 0) {
    const { error } = await service.from("inventory_logs").insert(logs);
    if (error) result.warnings.push("초기 재고 기록을 남기지 못했습니다. 재고 관리에서 확인해 주세요.");
  }
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const { service, user } = auth;

  const body = (await req.json().catch(() => null)) as
    | { mode?: BulkMode; products?: Record<string, unknown>[] }
    | null;
  const mode = body?.mode === "create" ? "create" : "validate";
  const rows = body?.products;
  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: "등록할 상품이 없습니다." }, { status: 400 });
  }
  if (rows.length > MAX_ROWS) {
    return NextResponse.json(
      { error: `한 번에 최대 ${MAX_ROWS}개 상품까지 처리할 수 있습니다.` },
      { status: 400 }
    );
  }

  let categories: CategoryLookup;
  try {
    categories = await getCategoryLookup(service);
  } catch (e) {
    console.error("[admin/products/bulk] category lookup failed:", e);
    return NextResponse.json({ error: "카테고리 정보를 불러오지 못했습니다." }, { status: 500 });
  }

  const prepared: PreparedProduct[] = [];
  const results: BulkResult[] = [];

  rows.forEach((row, index) => {
    const clientId = typeof row.client_id === "string" ? row.client_id : null;
    const rowNo = Number(row.row_no ?? row.rowNo ?? index + 1);
    try {
      const normalized = normalizeRow(row, categories);
      const result: BulkResult = {
        client_id: clientId,
        row_no: rowNo,
        name: String(normalized.product.name ?? ""),
        ok: true,
        warnings: [...normalized.warnings],
        errors: [],
      };
      // 검증만 눌러도 같은 문구가 보여야 한다 — 등록을 눌러야 알게 되면 고칠 기회가 늦다
      if (normalized.images.length === 0) {
        result.warnings.push("상품 사진이 없습니다. 판매를 시작하기 전에 대표 사진을 넣어 주세요.");
      }
      results.push(result);
      prepared.push({
        resultIndex: results.length - 1,
        product: normalized.product,
        images: normalized.images,
        detailImages: normalized.detailImages,
        variants: normalized.variants,
      });
    } catch (e) {
      results.push({
        client_id: clientId,
        row_no: rowNo,
        name: typeof row.name === "string" ? row.name : null,
        ok: false,
        warnings: [],
        errors: [e instanceof InputError || e instanceof Error ? e.message : "이 상품을 읽지 못했습니다."],
      });
    }
  });

  await validateUnique(service, prepared, results);

  if (mode === "create") {
    for (const item of prepared) {
      const result = results[item.resultIndex];
      // 이미 등록돼 있으면 건너뛴다 — 재시도를 몇 번 눌러도 중복이 생기지 않는다
      if (!result.ok || result.skipped) continue;
      await createOne(service, user.id, item, result);
    }

    // 실제로 insert 된 행이 하나라도 있을 때만 무효화한다.
    // mode==="validate" 는 SELECT 뿐이고, create 여도 전 행이 검증에서 걸리면 쓰기가 없다.
    // skipped 인 행은 product_id 가 기존 상품 id 이므로 새로 쓴 것이 아니다.
    if (results.some((r) => r.product_id && !r.skipped)) {
      revalidateTag(CACHE_TAGS.products, { expire: 0 });
    }
  }

  // 건너뛴 행(이미 같은 주소로 등록된 상품)은 ok:true 로 돌려준다 — 재시도를 안전하게 하려는 값이지
  // "이번에 등록된다" 는 뜻이 아니다. 그래서 셀 때는 반드시 빼야 한다.
  // 예전에는 그대로 세어, 30개 중 30개가 이미 있는 상황에서도 "30개를 등록했습니다" 라고 적었다.
  const skippedCount = results.filter((row) => row.skipped).length;
  const okCount = results.filter((row) => row.ok && !row.skipped).length;
  const failedCount = results.filter((row) => !row.ok).length;
  return NextResponse.json({
    mode,
    okCount,
    skippedCount,
    failedCount,
    results,
  });
}
