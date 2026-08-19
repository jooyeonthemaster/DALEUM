"use client";

/* ============================================================
   자동 임시 저장과 '변경됨' 판정을 한곳에 모은 훅.

   변경 여부를 필드마다 따로 추적하지 않고 폼 전체를 한 덩어리로 직렬화해 기준선과 비교한다.
   필드가 20개가 넘는 화면에서 플래그를 하나씩 두면 새 필드를 더할 때마다 빠뜨리고,
   빠뜨린 필드는 '변경 없음' 으로 취급돼 경고 없이 사라진다 — 실제로 폼에 브랜드·공급처가
   추가됐을 때 그런 종류의 누락이 났다.

   기준선(baseline)은 두 시점에 다시 잡는다: 상품을 불러온 직후, 그리고 저장에 성공한 직후.
   그 사이의 모든 변화가 '아직 저장하지 않은 것' 이다.
   ============================================================ */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  clearDraft,
  readDraft,
  serializeSnapshot,
  writeDraft,
  type LoadedDraft,
  type ProductFormSnapshot,
} from "./draft-storage";

/** 입력이 멎고 이만큼 지나면 초안을 남긴다. 글자마다 쓰면 긴 상세 본문에서 눈에 띄게 버벅인다. */
const AUTOSAVE_DELAY_MS = 3_000;

export interface UseProductDraftOptions {
  /** 초안 보관 키 (상품별 또는 신규 한 자리) */
  key: string;
  /** 지금 화면이 들고 있는 값 전체 — 호출부에서 useMemo 로 만들어 넘긴다 */
  snapshot: ProductFormSnapshot;
  /**
   * 편집 모드인지. 편집은 상품을 불러오기 전까지 화면이 빈 폼이라, 그 상태를 기준선으로 삼거나
   * 초안을 꺼내면 방금 불러올 값을 빈 폼으로 덮어쓴다. 그래서 markBaseline 이 불릴 때까지 멈춰 둔다.
   */
  needsLoad: boolean;
}

export interface UseProductDraftResult {
  /** 마지막 기준선 이후 바뀐 것이 있는지 */
  dirty: boolean;
  /** 이어서 쓸 수 있는 초안 (없으면 null) */
  offer: LoadedDraft | null;
  /** 초안을 버린다 */
  discardOffer: () => void;
  /** 초안을 받아들였다고 알린다 (실제 적용은 호출부가 한다) */
  acceptOffer: () => void;
  /** 마지막으로 초안을 남긴 시각 */
  draftSavedAt: number | null;
  /** 저장에 성공했으니 브라우저에 남은 초안을 지운다 */
  clearSavedDraft: () => void;
  /** 이 상태를 '저장된 상태' 로 삼는다 (상품 로드 직후·저장 직후) */
  markBaseline: (snap: ProductFormSnapshot) => void;
}

export function useProductDraft({
  key,
  snapshot,
  needsLoad,
}: UseProductDraftOptions): UseProductDraftResult {
  const serialized = useMemo(() => serializeSnapshot(snapshot), [snapshot]);
  // 첫 렌더의 값이 기준선이다. 편집 모드는 상품을 불러온 뒤 markBaseline 으로 다시 잡는다.
  const [baseline, setBaseline] = useState(serialized);
  const [offer, setOffer] = useState<LoadedDraft | null>(null);
  const [draftSavedAt, setDraftSavedAt] = useState<number | null>(null);
  // 신규 등록은 첫 화면이 곧 기준선이라 바로 시작한다. 편집은 상품을 받은 뒤에 시작한다.
  const [armed, setArmed] = useState(!needsLoad);
  // '초안을 이미 확인했다' 는 화면에 그려지는 값이 아니라서 상태로 둘 이유가 없다.
  const checkedRef = useRef(false);

  const dirty = armed && serialized !== baseline;

  // 남아 있는 초안 확인 — 화면당 한 번만.
  useEffect(() => {
    if (!armed || checkedRef.current) return;
    checkedRef.current = true;
    /* localStorage 는 React 밖의 저장소다. 렌더 중에 읽으면 서버가 그린 화면과 어긋나
       하이드레이션이 깨지므로 마운트 뒤에 읽는다. 한 박자 미루는 이유는 같은 커밋 안에서
       곧바로 상태를 바꾸면 렌더가 연쇄로 한 번 더 도는 것을 피하기 위해서다. */
    queueMicrotask(() => {
      const found = readDraft(key);
      if (!found) return;
      // 저장된 상품과 글자 하나 다르지 않은 초안은 물어볼 이유가 없다(오히려 불안하게 만든다).
      if (serializeSnapshot(found.snapshot) === serialized) {
        clearDraft(key);
        return;
      }
      setOffer(found);
    });
  }, [armed, key, serialized]);

  // 자동 임시 저장 — 입력이 멎으면 한 번. 복구 여부를 아직 안 정했을 때는 덮어쓰지 않는다.
  useEffect(() => {
    if (!checkedRef.current || offer !== null || !dirty) return;
    const timer = setTimeout(() => {
      if (writeDraft(key, snapshot)) setDraftSavedAt(Date.now());
    }, AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [offer, dirty, key, snapshot]);

  const discardOffer = useCallback(() => {
    clearDraft(key);
    setOffer(null);
  }, [key]);

  const acceptOffer = useCallback(() => setOffer(null), []);

  const clearSavedDraft = useCallback(() => {
    clearDraft(key);
    setDraftSavedAt(null);
  }, [key]);

  const markBaseline = useCallback((snap: ProductFormSnapshot) => {
    setBaseline(serializeSnapshot(snap));
    setArmed(true);
  }, []);

  return {
    dirty,
    offer,
    discardOffer,
    acceptOffer,
    draftSavedAt,
    clearSavedDraft,
    markBaseline,
  };
}
