"use client";

import { useEffect } from "react";
import { track } from "@/lib/analytics";

/** 검색 결과 페이지 진입 시 search 이벤트 기록 (렌더 없음) */
export default function SearchTracker({
  query,
  resultCount,
}: {
  query: string;
  resultCount: number;
}) {
  useEffect(() => {
    if (!query) return;
    track("search", { meta: { query, results: resultCount } });
  }, [query, resultCount]);

  return null;
}
