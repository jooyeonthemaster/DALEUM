"use client";

import { useSyncExternalStore } from "react";

const emptySubscribe = () => () => {};

/**
 * hydration 이후 true — zustand persist(장바구니) 내용을 안전하게 렌더하기 위한 게이트.
 * 서버/첫 클라이언트 렌더에서는 false를 반환해 hydration mismatch를 방지한다.
 */
export function useMounted(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );
}
