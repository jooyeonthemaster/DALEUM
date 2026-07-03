"use client";

import { X } from "lucide-react";
import { Input } from "@/components/admin/Field";
import type { KvRow } from "./form-types";

export interface KeyValueEditorProps {
  rows: KvRow[];
  onChange: (rows: KvRow[]) => void;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
  addLabel?: string;
}

/** 키-값 편집기 — nutrition/specs 공용 (행 추가/삭제) */
export default function KeyValueEditor({
  rows,
  onChange,
  keyPlaceholder = "항목",
  valuePlaceholder = "값",
  addLabel = "항목 추가",
}: KeyValueEditorProps) {
  function update(index: number, patch: Partial<KvRow>) {
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function remove(index: number) {
    onChange(rows.filter((_, i) => i !== index));
  }

  return (
    <div>
      {rows.length > 0 && (
        <ul className="space-y-2">
          {rows.map((row, i) => (
            <li key={i} className="flex items-center gap-2">
              <Input
                value={row.key}
                onChange={(e) => update(i, { key: e.target.value })}
                placeholder={keyPlaceholder}
                aria-label={`${i + 1}번째 항목 이름`}
                className="max-w-44"
              />
              <Input
                value={row.value}
                onChange={(e) => update(i, { value: e.target.value })}
                placeholder={valuePlaceholder}
                aria-label={`${i + 1}번째 항목 값`}
              />
              <button
                type="button"
                onClick={() => remove(i)}
                aria-label="항목 삭제"
                className="shrink-0 p-2 text-ink-400 transition-colors hover:text-signal-red"
              >
                <X size={16} strokeWidth={1.5} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        onClick={() => onChange([...rows, { key: "", value: "" }])}
        disabled={rows.length >= 30}
        className={`border border-dashed border-ink-300 px-3 py-1.5 text-xs text-ink-500 transition-colors hover:border-forest-600 hover:text-forest-700 disabled:opacity-40 ${
          rows.length > 0 ? "mt-2" : ""
        }`}
      >
        {addLabel}
      </button>
    </div>
  );
}
