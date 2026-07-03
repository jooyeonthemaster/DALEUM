"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { Input } from "@/components/admin/Field";
import { api, customerLabel, type CustomerHit } from "./vipApi";

export interface CustomerSearchProps {
  value: CustomerHit | null;
  onChange: (customer: CustomerHit | null) => void;
  placeholder?: string;
  className?: string;
}

/**
 * 고객 검색 셀렉터 — 이름/이메일로 profiles를 검색해 한 명을 선택한다.
 * 선택되면 칩으로 표시되고, 해제 버튼으로 다시 검색할 수 있다.
 */
export default function CustomerSearch({
  value,
  onChange,
  placeholder = "고객 이름 또는 이메일 검색",
  className = "",
}: CustomerSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CustomerHit[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // 외부 클릭으로 드롭다운 닫기
  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  // 디바운스 검색
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
          const data = await api<{ customers: CustomerHit[] }>(
            `/api/admin/vip/customers-search?q=${encodeURIComponent(q)}`
          );
          setResults(data.customers);
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

  if (value) {
    return (
      <div
        className={`flex items-center justify-between gap-3 border border-ink-200 bg-cream-100 px-3.5 py-2.5 ${className}`}
      >
        <div className="min-w-0">
          <p className="truncate text-sm text-ink-900">{customerLabel(value)}</p>
          {value.email && <p className="truncate text-xs text-ink-400">{value.email}</p>}
        </div>
        <button
          type="button"
          onClick={() => onChange(null)}
          aria-label="선택한 고객 해제"
          className="shrink-0 p-1 text-ink-400 transition-colors hover:text-ink-900"
        >
          <X size={16} strokeWidth={1.5} />
        </button>
      </div>
    );
  }

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => query.trim() && setOpen(true)}
        placeholder={placeholder}
        aria-label="고객 검색"
      />
      {open && (
        <div className="absolute inset-x-0 top-full z-20 mt-1 max-h-64 overflow-y-auto border border-ink-200 bg-cream-50">
          {searching ? (
            <p className="px-3.5 py-3 text-sm text-ink-400">검색 중…</p>
          ) : results.length === 0 ? (
            <p className="px-3.5 py-3 text-sm text-ink-400">검색 결과가 없습니다.</p>
          ) : (
            results.map((customer) => (
              <button
                key={customer.id}
                type="button"
                onClick={() => {
                  onChange(customer);
                  setQuery("");
                  setOpen(false);
                }}
                className="flex w-full items-baseline justify-between gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-cream-100"
              >
                <span className="min-w-0 truncate text-sm text-ink-900">
                  {customerLabel(customer)}
                </span>
                <span className="shrink-0 text-xs text-ink-400">{customer.email ?? ""}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
