"use client";

/* ============================================================
   영양·스펙 편집기.

   왜 다시 만들었나:
   옛 편집기는 한 줄 입력칸 두 개와 삭제 버튼을 나열한 것이 전부였다(74줄).
   그런데 실제 데이터는 그 형태를 견디지 못한다 —
     · 우동인데곤약: 스펙 22줄 + 영양 12줄 = 34줄
     · 냉면인데곤약 원재료명: 386자 (한 줄 입력칸 뒤로 사라져 오타를 못 잡는다)
     · 순서를 바꿀 방법이 없어, 중간에 한 줄 끼워 넣으려면 아래를 전부 지우고 다시 친다
     · 같은 이름을 두 번 넣으면 저장할 때 한 줄이 조용히 사라진다
     · 한도에 닿으면 버튼만 흐려지고 이유를 말해 주지 않는다
   그래서 값 칸을 자동 높이로 바꾸고, 순서 조작·찾기·자주 쓰는 항목·한도 안내를 붙였다.

   한도를 화면에서 미리 알리는 것이 특히 중요하다. 서버는 이제 긴 값을 자르지 않고
   저장 자체를 거절한다 — 미리 보이지 않으면 저장을 누른 뒤에야 알게 된다.
   ============================================================ */

import { useMemo, useState } from "react";
import { ChevronDown, Plus, Search } from "lucide-react";
import { Input } from "@/components/admin/Field";
import KvRowItem from "@/components/admin/detail/KvRowItem";
import {
  KV_MAX_ITEMS,
  KV_VALUE_MAX,
  type KvPresetGroup,
} from "@/components/admin/detail/kv-presets";
import type { KvRow } from "./form-types";

export interface KeyValueEditorProps {
  rows: KvRow[];
  onChange: (rows: KvRow[]) => void;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
  addLabel?: string;
  /** 자주 쓰는 항목 이름 묶음 — 누르면 그 이름으로 빈 줄이 생긴다 */
  presets?: KvPresetGroup[];
  /** 화면에 쓸 이름 (예: 영양 항목) */
  noun?: string;
}

/** 줄이 이만큼 넘으면 처음에 접어 둔다 — 22줄짜리 표가 탭을 통째로 밀어내기 때문 */
const COLLAPSE_FROM = 10;
/** 이만큼 넘으면 항목 찾기 칸을 보여 준다 */
const SEARCH_FROM = 8;

export default function KeyValueEditor({
  rows,
  onChange,
  keyPlaceholder = "항목",
  valuePlaceholder = "값",
  addLabel = "항목 추가",
  presets = [],
  noun = "항목",
}: KeyValueEditorProps) {
  const [open, setOpen] = useState(() => rows.length <= COLLAPSE_FROM);
  const [query, setQuery] = useState("");
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  /** 이미 쓰인 항목 이름 — 프리셋 중복 방지와 중복 경고에 함께 쓴다 */
  const keyCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of rows) {
      const key = row.key.trim();
      if (key) map.set(key, (map.get(key) ?? 0) + 1);
    }
    return map;
  }, [rows]);

  const tooLongKeys = useMemo(
    () =>
      rows
        .filter((r) => r.value.length > KV_VALUE_MAX)
        .map((r) => r.key.trim() || "이름 없는 항목"),
    [rows]
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const indexed = rows.map((row, index) => ({ row, index }));
    if (!q) return indexed;
    return indexed.filter(
      ({ row }) => row.key.toLowerCase().includes(q) || row.value.toLowerCase().includes(q)
    );
  }, [rows, query]);

  const filtering = query.trim() !== "";
  const full = rows.length >= KV_MAX_ITEMS;

  function update(index: number, patch: Partial<KvRow>) {
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function remove(index: number) {
    onChange(rows.filter((_, i) => i !== index));
  }

  function move(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= rows.length) return;
    const next = [...rows];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }

  function reorder(from: number, to: number) {
    if (from === to) return;
    const next = [...rows];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onChange(next);
  }

  /** 프리셋에서 아직 없는 이름만 골라 뒤에 붙인다 — 한도를 넘겨 채우지는 않는다 */
  function addKeys(keys: string[]) {
    const room = Math.max(0, KV_MAX_ITEMS - rows.length);
    const fresh = keys.filter((k) => !keyCounts.has(k)).slice(0, room);
    if (fresh.length === 0) return;
    onChange([...rows, ...fresh.map((key) => ({ key, value: "" }))]);
    setOpen(true);
  }

  return (
    <div>
      {/* 머리 — 몇 줄인지, 접었는지 */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="inline-flex items-center gap-1.5 text-sm text-ink-700 transition-colors hover:text-forest-700"
        >
          <ChevronDown
            size={15}
            strokeWidth={1.5}
            className={`transition-transform duration-200 ${open ? "" : "-rotate-90"}`}
          />
          {noun} <span className="krw">{rows.length}</span>개
          {rows.length > 0 && (
            <span className="krw text-xs text-ink-400">/ 최대 {KV_MAX_ITEMS}개</span>
          )}
        </button>
        {rows.length >= SEARCH_FROM && open && (
          <div className="relative w-full sm:w-56">
            <Search
              size={14}
              strokeWidth={1.5}
              aria-hidden
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-300"
            />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="항목 찾기"
              aria-label={`${noun} 찾기`}
              className="pl-8"
            />
          </div>
        )}
      </div>

      {open && (
        <>
          {rows.length > 0 && (
            <ul className="mt-3">
              {visible.map(({ row, index }) => (
                <KvRowItem
                  key={index}
                  row={row}
                  index={index}
                  total={rows.length}
                  onChange={(patch) => update(index, patch)}
                  onRemove={() => remove(index)}
                  onMove={(dir) => move(index, dir)}
                  duplicate={(keyCounts.get(row.key.trim()) ?? 0) > 1}
                  reorderable={!filtering}
                  dragging={dragIndex === index}
                  dropTarget={overIndex === index && dragIndex !== null && dragIndex !== index}
                  keyPlaceholder={keyPlaceholder}
                  valuePlaceholder={valuePlaceholder}
                  dragHandlers={{
                    onDragStart: () => setDragIndex(index),
                    onDragOver: (e) => {
                      e.preventDefault();
                      setOverIndex(index);
                    },
                    onDrop: () => {
                      if (dragIndex !== null) reorder(dragIndex, index);
                      setDragIndex(null);
                      setOverIndex(null);
                    },
                    onDragEnd: () => {
                      setDragIndex(null);
                      setOverIndex(null);
                    },
                  }}
                />
              ))}
            </ul>
          )}

          {filtering && visible.length === 0 && (
            <p className="mt-3 text-xs text-ink-400">찾는 항목이 없습니다.</p>
          )}
          {filtering && visible.length > 0 && (
            <p className="mt-2 text-xs text-ink-400">
              찾는 중에는 순서를 바꿀 수 없습니다. 찾기 칸을 비우면 다시 바꿀 수 있습니다.
            </p>
          )}

          {/* 자주 쓰는 항목 */}
          {presets.length > 0 && !filtering && (
            <div className="mt-4 border border-dashed border-ink-200 p-3">
              <p className="text-xs text-ink-500">
                자주 쓰는 항목입니다. 누르면 그 이름으로 빈 줄이 만들어집니다.
              </p>
              {presets.map((group) => {
                const missing = group.keys.filter((k) => !keyCounts.has(k));
                return (
                  <div key={group.label} className="mt-2.5 flex flex-wrap items-center gap-1.5">
                    <span className="label-caps mr-1 text-ink-400">{group.label}</span>
                    {group.keys.map((key) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => addKeys([key])}
                        disabled={keyCounts.has(key) || full}
                        className="border border-ink-200 px-2.5 py-1 text-xs text-ink-600 transition-colors hover:border-forest-600 hover:text-forest-700 disabled:border-ink-100 disabled:text-ink-300"
                      >
                        {key}
                      </button>
                    ))}
                    {missing.length > 1 && !full && (
                      <button
                        type="button"
                        onClick={() => addKeys(group.keys)}
                        className="px-2 py-1 text-xs text-forest-700 underline underline-offset-2 transition-colors hover:text-forest-800"
                      >
                        <span className="krw">{missing.length}</span>개 모두 넣기
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* 줄 추가 + 한도 안내 */}
          <button
            type="button"
            onClick={() => {
              onChange([...rows, { key: "", value: "" }]);
              setQuery("");
            }}
            disabled={full}
            className="mt-3 inline-flex items-center gap-1.5 border border-dashed border-ink-300 px-3 py-1.5 text-xs text-ink-500 transition-colors hover:border-forest-600 hover:text-forest-700 disabled:opacity-40"
          >
            <Plus size={14} strokeWidth={1.5} />
            {addLabel}
          </button>
          {full && (
            <p className="mt-1.5 text-xs leading-relaxed text-signal-amber">
              {noun}은 최대 <span className="krw">{KV_MAX_ITEMS}</span>개까지 넣을 수 있습니다. 더
              넣으려면 쓰지 않는 줄을 지워 주세요.
            </p>
          )}
          {tooLongKeys.length > 0 && (
            <p className="mt-1.5 text-xs leading-relaxed text-signal-red">
              「{tooLongKeys.join("」, 「")}」 값이 너무 깁니다. 한 항목에{" "}
              <span className="krw">{KV_VALUE_MAX.toLocaleString("ko-KR")}</span>자까지만 저장할 수
              있어, 지금 저장하면 거절됩니다.
            </p>
          )}
        </>
      )}
    </div>
  );
}
