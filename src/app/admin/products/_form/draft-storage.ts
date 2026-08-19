/* ============================================================
   상품 폼의 브라우저 임시 보관소 — 초안 / 복제 인계 / 저장 결과 인계.

   왜 필요한가:
   상품 하나를 제대로 등록하려면 사진·상세·영양·스펙까지 30분이 걸린다. 그런데 이 폼에는
   이탈 방어가 한 겹도 없었다(감사에서 admin 전체 beforeunload·localStorage 사용 0건).
   좌측 사이드바를 한 번 잘못 누르거나 새로고침만 해도 30분이 통째로 사라졌고,
   되돌릴 방법이 없어 처음부터 다시 쳐야 했다.

   그래서 입력이 바뀌면 브라우저에 초안을 남긴다. **서버로는 아무것도 보내지 않는다** —
   저장 버튼을 누르지 않은 값이 상품 데이터에 섞여 들어가면 안 되기 때문이다.

   보관 위치를 둘로 나눈 이유:
   - 초안(localStorage): 탭을 닫았다 다음 날 다시 열어도 살아 있어야 한다.
   - 복제·저장 결과(sessionStorage): 지금 이 탭에서 화면 하나를 건너가는 동안만 필요하다.
     남아 있으면 다음에 새 상품을 만들 때 엉뚱한 값이 따라붙는다.
   ============================================================ */

import type { DetailBlock } from "@/lib/detail-doc";
import type { FormState, KvRow, VariantDraft } from "../form-types";

/**
 * 폼이 다루는 이미지 한 장.
 *
 * alt(사진 설명)를 함께 들고 다니는 이유: 옛 폼은 불러올 때 alt 를 버리고 저장할 때도 안 보냈다.
 * 서버는 alt 가 없으면 상품명으로 채우므로, 아무것도 고치지 않고 저장만 눌러도
 * '곤약밥 영양성분표' 같이 사람이 적어 둔 설명이 전부 상품명으로 덮어써졌다.
 */
export interface ProductImageDraft {
  url: string;
  alt?: string | null;
}

/** 폼 전체를 한 덩어리로 뜬 스냅숏 — 초안 저장·복제·변경 감지가 모두 이 모양을 쓴다 */
export interface ProductFormSnapshot {
  form: FormState;
  images: ProductImageDraft[];
  detailBlocks: DetailBlock[];
  variants: VariantDraft[];
  nutritionRows: KvRow[];
  specRows: KvRow[];
}

interface StoredDraft extends ProductFormSnapshot {
  /** 저장 형식이 바뀌면 옛 초안을 되살리다 화면이 깨진다 — 버전이 다르면 그냥 버린다 */
  version: number;
  savedAt: number;
}

const DRAFT_VERSION = 3;
const DRAFT_PREFIX = "daleum:product-draft:";
const CLONE_KEY = "daleum:product-clone";
const FLASH_KEY = "daleum:product-saved";

/** 초안 보관 키 — 편집은 상품별로, 신규는 한 자리만 둔다(다음에 새 상품 화면을 열면 그 자리를 찾아야 하니까) */
export function draftKey(productId?: string): string {
  return `${DRAFT_PREFIX}${productId ?? "new"}`;
}

/** 변경 감지·초안 비교용 문자열. 키 순서가 흔들리면 안 되므로 스냅숏을 정해진 순서로 직렬화한다. */
export function serializeSnapshot(snap: ProductFormSnapshot): string {
  return JSON.stringify([
    snap.form,
    snap.images,
    snap.detailBlocks,
    snap.variants,
    snap.nutritionRows,
    snap.specRows,
  ]);
}

export interface LoadedDraft {
  snapshot: ProductFormSnapshot;
  savedAt: number;
}

export function readDraft(key: string): LoadedDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredDraft;
    if (!parsed || parsed.version !== DRAFT_VERSION || !parsed.form) return null;
    return {
      savedAt: parsed.savedAt,
      snapshot: {
        form: parsed.form,
        images: parsed.images ?? [],
        detailBlocks: parsed.detailBlocks ?? [],
        variants: parsed.variants ?? [],
        nutritionRows: parsed.nutritionRows ?? [],
        specRows: parsed.specRows ?? [],
      },
    };
  } catch {
    // 저장 공간이 잠겼거나(사파리 프라이빗) 값이 깨진 경우 — 초안이 없는 것과 똑같이 취급한다
    return null;
  }
}

/** 초안 기록. 저장 공간이 꽉 차도 폼 조작을 막으면 안 되므로 실패는 조용히 넘긴다(성공 여부를 돌려준다). */
export function writeDraft(key: string, snap: ProductFormSnapshot): boolean {
  if (typeof window === "undefined") return false;
  try {
    const payload: StoredDraft = { version: DRAFT_VERSION, savedAt: Date.now(), ...snap };
    window.localStorage.setItem(key, JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

export function clearDraft(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* 지우지 못해도 화면 동작에는 영향이 없다 */
  }
}

/* ------------------------------------------------------------
   상품 복제 인계.
   '150g × 10입' 과 '150g × 20입' 처럼 원산지·영양정보·상세설명이 똑같은 상품을 낼 때마다
   20개 필드와 영양표 전체를 손으로 옮겨 적어야 했다. 옮겨 적다 원산지·알레르기 표기가
   틀리면 표시광고법 문제가 되므로, 사람이 다시 치게 두지 않는다.
   ------------------------------------------------------------ */

export function writeClone(snap: ProductFormSnapshot): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.sessionStorage.setItem(CLONE_KEY, JSON.stringify(snap));
    return true;
  } catch {
    return false;
  }
}

/** 복제 꾸러미를 꺼내면서 지운다 — 남겨 두면 다음에 새 상품을 만들 때 또 따라붙는다 */
export function takeClone(): ProductFormSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(CLONE_KEY);
    if (!raw) return null;
    window.sessionStorage.removeItem(CLONE_KEY);
    return JSON.parse(raw) as ProductFormSnapshot;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------
   저장 결과 인계.
   신규 등록은 저장 성공 직후 편집 화면으로 갈아탄다. 그 사이 화면이 통째로 새로 그려지므로
   '등록되었습니다' 를 그냥 화면에 띄우면 즉시 사라진다 — 실제로 옛 폼은 성공 메시지를
   한 줄도 보여 주지 못했고, 관리자는 저장이 됐는지조차 확신할 수 없었다.
   ------------------------------------------------------------ */

export interface SavedFlash {
  productName: string;
  /** 등록 직후 고객에게 보이지 않는 상태(임시 저장·숨김)인지 — 배너에서 바로 판매 시작을 권한다 */
  hidden: boolean;
}

export function writeFlash(flash: SavedFlash): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(FLASH_KEY, JSON.stringify(flash));
  } catch {
    /* 못 남겨도 편집 화면은 정상이다 */
  }
}

export function takeFlash(): SavedFlash | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(FLASH_KEY);
    if (!raw) return null;
    window.sessionStorage.removeItem(FLASH_KEY);
    return JSON.parse(raw) as SavedFlash;
  } catch {
    return null;
  }
}
