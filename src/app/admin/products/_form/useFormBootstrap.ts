"use client";

/* ============================================================
   폼이 열릴 때 한 번씩 일어나는 일 세 가지.

   1) 카테고리 목록 가져오기
   2) 편집 모드에서 상품 불러오기
   3) 다른 화면에서 맡겨 둔 것 받기 — 복제 꾸러미(신규) / 등록 성공 알림(편집)

   본체에 그대로 두면 '무엇을 언제 하는가' 가 250줄 아래에 묻힌다. 성격이 같은 셋만 여기 모은다.
   ============================================================ */

import { useEffect, useRef, useState } from "react";
import type { Category, ProductWithImages } from "@/lib/types";
import { takeClone, takeFlash, type ProductFormSnapshot } from "./draft-storage";

interface DetailResponse {
  product: ProductWithImages;
  hasOrders: boolean;
}

export interface CategoriesState {
  categories: Category[];
  /** 아직 응답을 기다리는 중 */
  loading: boolean;
  /** 요청이 실제로 실패했다 (빈 목록과 구분한다) */
  failed: boolean;
}

/**
 * 카테고리 선택지.
 *
 * '아직 못 받았다' 와 '받아 봤더니 실패였다' 를 반드시 구분해서 돌려준다.
 * 예전에는 목록만 돌려줬고 화면은 `길이 0` 하나로 실패를 단정했다 — 그래서 폼을 열 때마다
 * 응답이 오기 전 한 박자 동안 '카테고리 목록을 불러오지 못했습니다. 새로고침하세요' 라는
 * 거짓 오류가 떴다. 작성 중인 사람에게 새로고침을 시키는 문구라 실제로 입력을 날릴 수 있었다.
 * (카테고리가 정말 0개인 경우도 '실패' 로 몰아 붙이던 문제도 함께 사라진다)
 */
export function useCategories(): CategoriesState {
  const [state, setState] = useState<CategoriesState>({
    categories: [],
    loading: true,
    failed: false,
  });
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/categories");
        const data = res.ok
          ? ((await res.json().catch(() => null)) as { categories?: Category[] } | null)
          : null;
        if (cancelled) return;
        if (!data?.categories) {
          setState({ categories: [], loading: false, failed: true });
          return;
        }
        setState({ categories: data.categories, loading: false, failed: false });
      } catch {
        if (!cancelled) setState({ categories: [], loading: false, failed: true });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return state;
}

export interface ProductLoadState {
  loading: boolean;
  loadError: string | null;
  hasOrders: boolean;
}

/** 편집 모드에서 상품 한 건 불러오기. populate 는 호출부가 준 '화면에 얹기' 동작이다. */
export function useProductLoad(
  productId: string | undefined,
  populate: (p: ProductWithImages) => void
): ProductLoadState {
  const [loading, setLoading] = useState(!!productId);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hasOrders, setHasOrders] = useState(false);

  useEffect(() => {
    if (!productId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/admin/products/${productId}`);
        const data = (await res.json().catch(() => null)) as
          | (DetailResponse & { error?: string })
          | null;
        if (!res.ok || !data?.product) {
          throw new Error(data?.error ?? "상품을 불러오지 못했습니다.");
        }
        if (cancelled) return;
        populate(data.product);
        setHasOrders(data.hasOrders);
      } catch (e) {
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : "상품을 불러오지 못했습니다.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [productId, populate]);

  return { loading, loadError, hasOrders };
}

export interface FormHandoffOptions {
  isNew: boolean;
  applySnapshot: (snap: ProductFormSnapshot) => void;
  /** 받은 것을 화면 위 띠로 알린다 */
  onNotice: (notice: { title: string; detail?: string }) => void;
  /**
   * 복제 꾸러미를 실제로 받아 얹었을 때 한 번 불린다.
   *
   * 호출부가 여기서 두 가지를 한다:
   * 1) 복제로 들어온 주소는 사람이 정한 값으로 취급한다(상품명을 고쳐도 덮어쓰지 않는다).
   * 2) 이 자리에 남아 있던 옛 초안 제안을 버린다 — 신규 등록 화면의 초안은 상품별이 아니라
   *    'new' 한 자리를 함께 쓴다. 지난번에 만들다 만 상품의 초안이 남아 있으면, 방금 복제해 온
   *    내용 위에 '이어서 작성하시겠어요?' 가 뜨고 그것을 누르는 순간 복제본이 통째로 사라진다.
   *    게다가 제안이 떠 있는 동안에는 자동 임시 저장이 멈추므로 복제본은 저장도 되지 않는다.
   */
  onCloneApplied: () => void;
}

/**
 * 다른 화면에서 맡겨 둔 꾸러미 받기.
 *
 * 브라우저 저장소는 렌더 중에 읽으면 서버가 그린 화면과 어긋나 하이드레이션이 깨진다.
 * 그래서 마운트 뒤에 읽고, 같은 커밋 안에서 상태를 연달아 바꾸지 않도록 한 박자 미룬다.
 */
export function useFormHandoff({
  isNew,
  applySnapshot,
  onNotice,
  onCloneApplied,
}: FormHandoffOptions): void {
  const doneRef = useRef(false);
  useEffect(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    queueMicrotask(() => {
      if (isNew) {
        const clone = takeClone();
        if (!clone) return;
        applySnapshot(clone);
        onCloneApplied();
        onNotice({
          title: "복제한 내용을 그대로 불러왔습니다.",
          detail:
            "상품명과 상품 주소가 원본과 겹치지 않는지 확인해 주세요. 재고는 0개, 판매 상태는 임시 저장으로 두었습니다.",
        });
        return;
      }
      const flash = takeFlash();
      if (!flash) return;
      onNotice({
        title: `'${flash.productName}' 상품이 등록되었습니다.`,
        detail: flash.hidden
          ? "지금은 고객에게 보이지 않는 상태입니다. 아래 버튼으로 바로 판매를 시작할 수 있습니다."
          : undefined,
      });
    });
  }, [isNew, applySnapshot, onNotice, onCloneApplied]);
}
