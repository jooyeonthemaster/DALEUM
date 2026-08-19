/* ============================================================
   배너 목록의 순서·노출 상태 계산 — 화면에서 떼어 낸 순수 함수.

   왜 떼어 냈나: 이 계산은 **스토어프론트와 한 글자도 어긋나면 안 된다.**
   src/app/(shop)/page.tsx:64-67 이 "사진이 있고 기간이 유효한 첫 배너 한 건" 만
   홈에 올리므로, 같은 순서로 훑어야 관리자 목록이 "지금 나가는 그 한 건" 을
   맞게 짚는다. 화면 코드 한가운데에 박혀 있으면 이 사실이 눈에 띄지 않고,
   BannersTab 이 400줄을 넘어가면서 더 읽히지 않게 됐다.
   ============================================================ */

import type { Banner } from "@/lib/types";
import { exposureState, type ExposureState } from "./ExposureBadge";
import { RENDERED_PLACEMENT } from "./BannerForm";

/** 스토어프론트와 같은 순서로 정렬 — 홈 대문 자리 먼저, 그다음 노출 순서, 같으면 최신 먼저 */
export function orderBanners(rows: Banner[]): Banner[] {
  return [...rows].sort((a, b) => {
    if (a.placement !== b.placement) return a.placement === RENDERED_PLACEMENT ? -1 : 1;
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
    return a.created_at < b.created_at ? 1 : -1;
  });
}

/**
 * 행마다 "지금 고객 화면에 보이는가". 앞에서 한 건이 이미 나가고 있으면
 * 뒤 배너는 전부 '대기' 다 — 여러 개를 켜도 하나만 나간다는 사실이 여기서 나온다.
 */
export function bannerStates(ordered: Banner[], now: Date): Map<string, ExposureState> {
  const map = new Map<string, ExposureState>();
  let taken = false;
  for (const row of ordered) {
    // 렌더 지점이 없는 옛 자리(띠·중간·맨 아래)는 켜져 있어도 고객에게 보일 곳이 없다
    if (row.placement !== RENDERED_PLACEMENT) {
      map.set(row.id, "hidden");
      continue;
    }
    const state = exposureState(
      {
        is_active: row.is_active,
        starts_at: row.starts_at,
        ends_at: row.ends_at,
        needsImage: true,
        hasImage: Boolean(row.image_url),
      },
      taken,
      now
    );
    if (state === "live") taken = true;
    map.set(row.id, state);
  }
  return map;
}
