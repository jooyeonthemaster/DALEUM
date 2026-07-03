"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Input } from "@/components/admin/Field";
import { krw } from "@/lib/format";
import { api, PRODUCT_STATUS_LABELS, type ProductHit } from "./vipApi";

export interface ProductSearchProps {
  onAdd: (product: ProductHit) => void;
  /** 이미 추가된 상품 id — 목록에서 "추가됨"으로 비활성 표시 */
  excludeIds?: string[];
  placeholder?: string;
  className?: string;
}

/**
 * 상품 검색 셀렉터 — 상품명으로 검색해 목록에 추가한다.
 * 이미 추가된 상품은 비활성으로 표시된다.
 */
export default function ProductSearch({
  onAdd,
  excludeIds = [],
  placeholder = "상품명으로 검색해 추가",
  className = "",
}: ProductSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProductHit[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  useEffect(() => {
    const q = query.trim();
    const timer = setTimeout(
      async () => {
        if (!q) {
          setResults([]);
          setSearching(false);
          return;
        }
        setSearching(true);
        try {
          const data = await api<{ products: ProductHit[] }>(
            `/api/admin/vip/products-search?q=${encodeURIComponent(q)}`
          );
          setResults(data.products);
          setOpen(true);
        } catch {
          setResults([]);
        } finally {
          setSearching(false);
        }
      },
      q ? 300 : 0
    );
    return () => clearTimeout(timer);
  }, [query]);

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => query.trim() && setOpen(true)}
        placeholder={placeholder}
        aria-label="상품 검색"
      />
      {open && (
        <div className="absolute inset-x-0 top-full z-20 mt-1 max-h-72 overflow-y-auto border border-ink-200 bg-cream-50">
          {searching ? (
            <p className="px-3.5 py-3 text-sm text-ink-400">검색 중…</p>
          ) : results.length === 0 ? (
            <p className="px-3.5 py-3 text-sm text-ink-400">검색 결과가 없습니다.</p>
          ) : (
            results.map((product) => {
              const added = excludeIds.includes(product.id);
              return (
                <button
                  key={product.id}
                  type="button"
                  disabled={added}
                  onClick={() => {
                    onAdd(product);
                    setQuery("");
                    setOpen(false);
                  }}
                  className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-cream-100 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-cream-50"
                >
                  <span className="relative block h-10 w-10 shrink-0 overflow-hidden border border-ink-200 bg-cream-100">
                    {product.image_url && (
                      <Image
                        src={product.image_url}
                        alt=""
                        fill
                        sizes="40px"
                        className="object-cover"
                      />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-ink-900">{product.name}</span>
                    <span className="krw block text-xs text-ink-400">
                      {krw(product.price)}원
                      {product.status !== "active" && (
                        <span className="ml-1.5 text-signal-amber">
                          {PRODUCT_STATUS_LABELS[product.status] ?? product.status}
                        </span>
                      )}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-ink-400">
                    {added ? "추가됨" : "추가"}
                  </span>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
