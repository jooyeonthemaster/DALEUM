/* ============================================================
   일괄 등록의 순수 로직 — 작성 중 보관 · 서버로 보낼 모양 · 입력 검증

   화면 파일에서 떼어 냈다(한 파일 500줄 상한). 이 셋은 렌더와 무관해서
   따로 두면 "무엇이 오류로 잡히는가" 를 JSX 를 걷어 내고 볼 수 있다.
   ============================================================ */

import { krw } from "@/lib/format";
import { isValidSlug } from "./bulk-slug";
import { MAX_PRODUCTS, rowsToObject, toNumeric } from "./bulk-types";
import type { BulkResponse, BulkResult, DraftImage, DraftIssue, ProductDraft } from "./bulk-types";
import type { SheetImportResult } from "./bulk-sheet";

/* ── 작성 중 내용 보관 ─────────────────────────────────── */

export const STORAGE_KEY = "daleum:bulk-drafts:v1";
export const EMPTY_SUBSCRIBE = () => () => {};

// 모듈 수준에서 한 번만 읽는다. useSyncExternalStore 의 getSnapshot 은 렌더마다
// 불리므로, 자동 저장으로 값이 계속 바뀌면 스냅샷이 흔들려 재렌더가 반복된다.
let cachedSaved: string | null | undefined;
export function readSavedOnce(): string | null {
  if (cachedSaved === undefined) {
    try {
      cachedSaved = localStorage.getItem(STORAGE_KEY);
    } catch {
      cachedSaved = null;
    }
  }
  return cachedSaved;
}

/**
 * 화면을 떠날 때 스냅샷을 버린다.
 *
 * 모듈 수준 캐시는 페이지를 새로 그려도 살아남는다. 상품 목록에 다녀온 뒤
 * 이 화면으로 돌아오면 **처음 들어왔을 때 읽은 옛 내용**이 그대로 남아 있어,
 * "이어서 하시겠어요?" 가 방금 작업한 것이 아니라 이전 것을 되살린다.
 * 그것을 누르는 순간 새로 한 작업이 사라지므로, 떠날 때 비워 다음 진입에 다시 읽게 한다.
 */
export function forgetSavedSnapshot(): void {
  cachedSaved = undefined;
}

/** 저장된 초안이 실제로 쓸 만한지 — 빈 카드 하나만 있는 상태는 되살릴 가치가 없다 */
export function parseSaved(raw: string | null): ProductDraft[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ProductDraft[];
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    const meaningful = parsed.filter(
      (d) => d.name?.trim() || d.galleryImages?.length || d.detailImages?.length
    );
    return meaningful.length > 0 ? parsed : null;
  } catch {
    return null;
  }
}


/* ── 서버로 보낼 모양 ─────────────────────────────────── */

export function toApiRow(draft: ProductDraft, index: number) {
  return {
    client_id: draft.id,
    row_no: index + 1,
    name: draft.name.trim(),
    slug: draft.slug.trim(),
    category: draft.category || undefined,
    subtitle: draft.subtitle || undefined,
    description: draft.description || undefined,
    // 치수를 함께 보낸다 — 서버가 상세 마크다운에 `|가로x세로` 를 붙여야
    // 고객 화면에서 이미지가 로드된 뒤 튀지 않는다
    detail_images: draft.detailImages.map((i) => ({ url: i.url, width: i.width, height: i.height })),
    primary_images: draft.galleryImages.map((i) => ({ url: i.url, width: i.width, height: i.height })),
    price: toNumeric(draft.price) ?? 0,
    compare_at_price: toNumeric(draft.comparePrice) ?? undefined,
    cost_price: toNumeric(draft.costPrice) ?? undefined,
    sku: draft.sku || undefined,
    stock: toNumeric(draft.stock) ?? 0,
    low_stock_threshold: 10,
    status: draft.status,
    storage_type: draft.storage,
    origin: draft.origin || undefined,
    weight: draft.weight || undefined,
    units_per_pack: toNumeric(draft.unitsPerPack) ?? 1,
    badges: draft.badges,
    tags: draft.tags,
    nutrition: rowsToObject(draft.nutrition),
    specs: rowsToObject(draft.specs),
    variants: draft.variants.map((v) => ({
      name: v.name.trim(),
      price_delta: toNumeric(v.priceDelta) ?? 0,
      stock: toNumeric(v.stock) ?? 0,
      sku: v.sku || null,
      is_active: true,
    })),
  };
}


/** 한 번에 서버로 보내는 묶음 크기 — 중간에 끊겨도 어디까지 됐는지 남게 나눠 보낸다 */
export const CHUNK = 10;

/** 배열을 n개씩 자른다 */
export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * 입력 문제를 **전부** 모은다.
 * 옛 코드는 첫 오류에서 바로 멈춰 문자열 하나만 돌려줬다. 30개를 올리면
 * 고치고 다시 누르기를 30번 반복해야 했고, 그 안내에 적힌 번호마저
 * 화면의 카드 번호와 어긋나 엉뚱한 카드를 열게 했다.
 */
export function collectIssues(pending: ProductDraft[]): DraftIssue[] {
  const found: DraftIssue[] = [];
  const slugOwners = new Map<string, ProductDraft[]>();

  for (const draft of pending) {
    const label = draft.name.trim() ? `'${draft.name.trim()}'` : "이름 없는 상품";

    if (!draft.name.trim()) {
      found.push({ draftId: draft.id, field: "name", message: "상품명을 입력해 주세요." });
    }
    if (!draft.slug.trim()) {
      found.push({
        draftId: draft.id,
        field: "slug",
        message: `${label} 의 상품 주소를 정해 주세요. '상품명에서 만들기' 를 누르면 자동으로 채워집니다.`,
      });
    } else if (!isValidSlug(draft.slug.trim())) {
      found.push({
        draftId: draft.id,
        field: "slug",
        message: "상품 주소에는 영문 소문자·숫자·붙임표(-)만 쓸 수 있습니다.",
      });
    } else {
      const key = draft.slug.trim();
      slugOwners.set(key, [...(slugOwners.get(key) ?? []), draft]);
    }

    const price = toNumeric(draft.price);
    if (price == null || price <= 0) {
      found.push({ draftId: draft.id, field: "price", message: "판매가를 숫자로 입력해 주세요." });
    }
    if (toNumeric(draft.stock) == null) {
      found.push({ draftId: draft.id, field: "stock", message: "재고를 숫자로 입력해 주세요." });
    }
    // 사진은 **판매중으로 열 때만** 반드시 있어야 한다.
    // 임시 저장까지 막으면, 엑셀만 먼저 올려 두고 사진은 나중에 받는 실제 순서를
    // 쓸 수 없다 — 품목표는 먼저 오고 제조사 사진은 며칠 뒤에 오는 일이 흔하다.
    // 반면 사진 없는 상품을 판매중으로 열면 고객 목록에 빈 칸이 걸린다.
    if (draft.status === "active" && draft.galleryImages.length === 0) {
      found.push({
        draftId: draft.id,
        field: "gallery",
        message: `${label} 은 사진 없이 판매중으로 열 수 없습니다. 사진을 올리거나 임시 저장으로 두세요.`,
      });
    }
    // 재고 0인 채로 판매중을 열면 고객 목록에 품절 상품만 걸린다.
    // 서버의 판매 가능 검사(assertSellablePrice)는 가격만 보므로 여기서 막지 않으면 그대로 나간다.
    // 엑셀에 재고 칸이 없으면 전부 0으로 들어오기 때문에 실제로 흔하다.
    const totalStock =
      (toNumeric(draft.stock) ?? 0) +
      draft.variants.reduce((sum, v) => sum + (toNumeric(v.stock) ?? 0), 0);
    if (draft.status === "active" && totalStock <= 0) {
      found.push({
        draftId: draft.id,
        field: "stock",
        message: `${label} 은 재고가 0이라 판매중으로 열 수 없습니다. 재고를 채우거나 임시 저장으로 두세요.`,
      });
    }
    if (draft.variants.some((v) => !v.name.trim())) {
      found.push({ draftId: draft.id, field: "variants", message: "옵션 이름을 빠짐없이 적어 주세요." });
    }
  }

  // 주소가 겹치면 어느 상품끼리 겹쳤는지 이름으로 알려 준다 — 코드값을 그대로 보이지 않는다
  for (const owners of slugOwners.values()) {
    if (owners.length < 2) continue;
    const names = owners.map((d) => `'${d.name.trim() || "이름 없는 상품"}'`).join(" 과 ");
    for (const owner of owners) {
      found.push({
        draftId: owner.id,
        field: "slug",
        message: `${names} 의 상품 주소가 같습니다. 한쪽을 바꿔 주세요.`,
      });
    }
  }

  return found;
}

/* ── 폴더에서 올린 사진 붙이기 ─────────────────────────── */

/** 폴더 통째로 올리기가 한 상품에 넘겨준 사진 */
export interface FolderImages {
  draftId: string;
  gallery: DraftImage[];
  detail: DraftImage[];
  notes: string[];
}

/**
 * 폴더에서 올린 사진을 카드에 붙인다.
 *
 * 상품 사진 상한을 여기서도 지키는 이유: 서버(shared.ts parseImages)는 21장째부터
 * **말없이 버린다.** 카드에서 한 장씩 넣을 때는 DraftImageLane 이 막지만, 폴더를 통째로
 * 올리면 그 문을 지나지 않는다 — 사진 25장짜리 폴더 하나면 5장이 소리 없이 사라진다.
 */
export function mergeFolderImages(
  drafts: ProductDraft[],
  applied: FolderImages[],
  maxGallery: number
): { next: ProductDraft[]; added: number; dropped: number } {
  let added = 0;
  let dropped = 0;

  const next = drafts.map((item) => {
    const hit = applied.find((a) => a.draftId === item.id);
    if (!hit) return item;
    const merged = [...item.galleryImages, ...hit.gallery];
    const gallery = merged.slice(0, maxGallery);
    dropped += merged.length - gallery.length;
    added += gallery.length - item.galleryImages.length + hit.detail.length;
    return {
      ...item,
      galleryImages: gallery,
      detailImages: [...item.detailImages, ...hit.detail],
      notes: [...item.notes, ...hit.notes],
    };
  });

  return { next, added, dropped };
}

/* ── 서버 호출 · 결과 문구 ─────────────────────────────── */

/** 한 묶음을 서버에 보낸다. 화면은 상태만 다루도록 이 통신을 여기로 뺐다 */
export async function postBulk(
  mode: "validate" | "create",
  rows: ReturnType<typeof toApiRow>[]
): Promise<BulkResponse> {
  const res = await fetch("/api/admin/products/bulk", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode, products: rows }),
  });
  const data = (await res.json().catch(() => null)) as BulkResponse | null;
  if (!res.ok || !data) throw new Error(data?.error ?? "요청을 처리하지 못했습니다.");
  return data;
}

/**
 * 결과를 사람이 읽는 한 줄로 바꾼다.
 *
 * ⚠ 건너뛴 행(이미 같은 주소로 등록된 상품)도 ok:true 로 온다 — 재시도를 안전하게 하려는
 * 표시이지 "이번에 등록된다" 는 뜻이 아니다. 함께 세면 하나도 등록되지 않은 재시도에서도
 * "30개를 등록했습니다" 가 떠서, 대표가 상품이 두 벌 들어간 줄 알고 목록을 뒤지게 된다.
 */
export function summarizeResults(
  collected: BulkResult[],
  mode: "validate" | "create"
): { tone: "ok" | "error"; text: string } {
  const skipped = collected.filter((r) => r.skipped).length;
  const okCount = collected.filter((r) => r.ok && !r.skipped).length;
  const failed = collected.filter((r) => !r.ok).length;
  const text = [
    mode === "create" ? `${krw(okCount)}개를 등록했습니다.` : `${krw(okCount)}개는 바로 등록할 수 있습니다.`,
    skipped > 0
      ? mode === "create"
        ? `${krw(skipped)}개는 이미 있어 건너뛰었습니다.`
        : `${krw(skipped)}개는 이미 있어 건너뜁니다.`
      : "",
    failed > 0 ? `${krw(failed)}개는 확인이 필요합니다.` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  return { tone: failed === 0 ? "ok" : "error", text };
}

/** 엑셀을 불러온 직후의 안내 — 말없이 기본값으로 채운 것을 반드시 함께 적는다 */
export function importMessage(result: SheetImportResult): string {
  return [
    `상품 ${result.stats.productCount}개를 불러왔습니다` +
      (result.stats.variantCount > 0 ? ` (옵션 ${result.stats.variantCount}개 포함).` : "."),
    result.queued.length > 0
      ? `한 번에 ${MAX_PRODUCTS}개까지만 올릴 수 있어 ${result.queued.length}개는 대기열에 두었습니다.`
      : "",
    ...result.notes,
    "사진은 위쪽에서 폴더째 올리거나 카드마다 넣어 주세요.",
  ]
    .filter(Boolean)
    .join(" ");
}
