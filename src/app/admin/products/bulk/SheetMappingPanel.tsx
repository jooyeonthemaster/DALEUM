"use client";

/* ============================================================
   엑셀 불러오기 — 읽고 바로 넣지 않고, "이렇게 읽었다" 를 먼저 보여 준다

   왜 확인 단계를 넣었는가:
   회사가 쓰는 품목표는 제목 줄이 3번째에 있고 제품명 칸이 병합돼 있다.
   기계가 아무리 잘 맞혀도 틀릴 수 있는데, 옛 화면은 맞혔는지 틀렸는지 보여 주지 않고
   곧바로 카드를 갈아치웠다. 틀리면 "불러올 상품이 없습니다" 한 줄이 전부였고,
   맞아도 판매가와 원가가 뒤바뀌었는지 확인할 방법이 없었다.

   그래서 (1) 제목 줄을 어디로 봤는지 (2) 각 칸을 무엇으로 대응시켰는지
   (3) 그 결과 몇 개 상품·몇 개 옵션이 되는지를 전부 보여 주고,
   사람이 고친 뒤 눌러서 확정한다.
   ============================================================ */

import { useMemo, useRef, useState } from "react";
import { Download, Loader2, UploadCloud } from "lucide-react";
import { Help, Select } from "@/components/admin/Field";
import { STORAGE_TYPE_LABELS } from "@/lib/admin-labels";
import type { Category } from "@/lib/types";
import { BTN_GHOST, BTN_PRIMARY } from "../product-ui";
import {
  FIELD_OPTIONS,
  buildDrafts,
  detectHeaderRow,
  guessMapping,
  readGrid,
  type ColumnTarget,
  type SheetImportResult,
} from "./bulk-sheet";
import { MAX_PRODUCTS, MAX_SHEET_ROWS, toNumeric } from "./bulk-types";

export interface SheetMappingPanelProps {
  categories: Category[];
  /** 사람이 "이대로 불러오기" 를 눌렀을 때 */
  onConfirm: (result: SheetImportResult) => void;
}

/** 머리글 후보로 보여 줄 줄 수 — 실제 파일은 제목·날짜 두 줄이 위에 있었다 */
const HEADER_CANDIDATES = 8;

export default function SheetMappingPanel({ categories, onConfirm }: SheetMappingPanelProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [grid, setGrid] = useState<string[][] | null>(null);
  const [fileName, setFileName] = useState("");
  const [headerRow, setHeaderRow] = useState(0);
  const [mapping, setMapping] = useState<ColumnTarget[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const preview = useMemo<SheetImportResult | null>(() => {
    if (!grid) return null;
    return buildDrafts(grid, headerRow, mapping, categories);
  }, [grid, headerRow, mapping, categories]);

  async function downloadTemplate() {
    const XLSX = await import("xlsx");
    const workbook = XLSX.utils.book_new();

    // 예시 값은 반드시 화면에서 쓰는 한국어 그대로 — 옛 양식은 카테고리 예시가 'noodle' 이라
    // 사용자가 카테고리를 영문 코드로 적어야 하는 줄 알고 따라 썼다.
    const headers = [
      "상품명",
      "상품 주소",
      "카테고리",
      "판매가",
      "정가",
      "원가",
      "재고",
      "보관 방법",
      "원산지",
      "규격",
      "포장 입수",
      "한줄 소개",
      "상품 설명",
    ];
    const example = [
      "여주발효곤약밥",
      "yeoju-konjac-rice",
      categories[0]?.name ?? "곤약밥",
      19200,
      0,
      14300,
      100,
      STORAGE_TYPE_LABELS.room,
      "국내산",
      "150g",
      10,
      "여주를 넣어 발효한 곤약밥",
      "쫄깃한 식감의 저칼로리 곤약밥입니다.",
    ];
    const sheet = XLSX.utils.aoa_to_sheet([headers, example]);
    XLSX.utils.book_append_sheet(workbook, sheet, "상품 목록");

    // 두 번째 시트에 실제 카테고리 이름을 실어, 사람이 보고 그대로 옮겨 적게 한다
    const help = XLSX.utils.aoa_to_sheet([
      ["여기 적힌 이름을 '카테고리' 칸에 그대로 적어 주세요"],
      ...categories.map((category) => [category.name]),
      [],
      ["보관 방법은 아래 셋 중 하나"],
      [STORAGE_TYPE_LABELS.room],
      [STORAGE_TYPE_LABELS.chilled],
      [STORAGE_TYPE_LABELS.frozen],
      [],
      ["같은 상품의 포장 단위가 여러 개면"],
      ["상품명은 첫 줄에만 적고 아랫줄은 비워 두세요. 옵션으로 묶입니다."],
    ]);
    XLSX.utils.book_append_sheet(workbook, help, "적는 방법");

    XLSX.writeFile(workbook, "다름-상품-일괄등록-양식.xlsx");
  }

  async function loadFile(file: File) {
    setBusy(true);
    setError(null);
    try {
      const nextGrid = await readGrid(file);
      if (nextGrid.length === 0) {
        setError("이 파일에서 읽을 내용을 찾지 못했습니다. 다른 파일인지 확인해 주세요.");
        setBusy(false);
        return;
      }
      const detected = detectHeaderRow(nextGrid);
      const row = detected >= 0 ? detected : 0;
      setGrid(nextGrid);
      setFileName(file.name);
      setHeaderRow(row);
      setMapping(guessMapping(nextGrid[row] ?? []));
      if (detected < 0) {
        setError(
          "제목 줄을 찾지 못했습니다. 아래에서 상품명이 적힌 줄을 직접 골라 주세요."
        );
      }
    } catch {
      setError("엑셀 파일을 읽지 못했습니다. 양식을 내려받아 다시 작성해 주세요.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function pickHeaderRow(row: number) {
    if (!grid) return;
    setHeaderRow(row);
    setMapping(guessMapping(grid[row] ?? []));
  }

  const headerCells = grid?.[headerRow] ?? [];
  const hasName = mapping.includes("name");
  const hasPrice = mapping.includes("price");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => void downloadTemplate()} className={`${BTN_GHOST} inline-flex items-center gap-2`}>
          <Download size={16} strokeWidth={1.5} />
          빈 양식 받기
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls,.csv,.tsv"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void loadFile(file);
          }}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          className={`${BTN_PRIMARY} inline-flex items-center gap-2`}
        >
          {busy ? <Loader2 size={16} strokeWidth={1.5} className="animate-spin" /> : <UploadCloud size={16} strokeWidth={1.5} />}
          엑셀 파일 고르기
        </button>
        <p className="text-xs text-ink-400">
          회사에서 쓰는 품목표를 그대로 올려도 됩니다. 제목 줄이 몇 번째든 찾아냅니다.
        </p>
      </div>

      {error && <p className="border border-signal-red bg-[#f8eee9] px-3 py-2 text-sm text-signal-red">{error}</p>}

      {grid && (
        <div className="space-y-5 border-t border-ink-100 pt-4">
          <p className="text-sm text-ink-600">
            <span className="font-medium text-ink-900">{fileName}</span> 을 읽었습니다.
          </p>

          {/* 1) 제목 줄 확인 */}
          <section>
            <h3 className="text-sm font-semibold text-ink-900">1. 이 줄이 제목 줄이 맞나요?</h3>
            <p className="mt-1 text-xs text-ink-400">
              상품명·판매가 같은 항목 이름이 적힌 줄입니다. 위쪽의 문서 제목이나 날짜 줄은 건너뜁니다.
            </p>
            <ul className="mt-2 space-y-1">
              {grid.slice(0, HEADER_CANDIDATES).map((row, i) => (
                <li key={i}>
                  <label
                    className={`flex cursor-pointer items-start gap-2 border px-3 py-2 text-xs transition-colors ${
                      headerRow === i ? "border-forest-700 bg-forest-50" : "border-ink-100 hover:bg-cream-100"
                    }`}
                  >
                    <input
                      type="radio"
                      name="header-row"
                      checked={headerRow === i}
                      onChange={() => pickHeaderRow(i)}
                      className="mt-0.5 shrink-0 accent-[#2f4f3a]"
                    />
                    <span className="krw shrink-0 text-ink-400">{i + 1}번째 줄</span>
                    <span className="min-w-0 flex-1 truncate text-ink-700">
                      {row.filter(Boolean).join(" · ") || "(빈 줄)"}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </section>

          {/* 2) 칸 대응 */}
          <section>
            <h3 className="text-sm font-semibold text-ink-900">2. 엑셀의 각 칸을 무엇으로 넣을까요?</h3>
            <p className="mt-1 text-xs text-ink-400">
              자동으로 맞춰 두었습니다. 잘못 잡힌 것만 바꿔 주세요. 쓰지 않을 칸은 &lsquo;사용 안 함&rsquo; 으로 두면 됩니다.
            </p>
            <ul className="mt-2 grid gap-2 md:grid-cols-2">
              {headerCells.map((cell, col) => (
                <li key={col} className="flex items-center gap-2 border border-ink-100 bg-cream-100/50 px-3 py-2">
                  <span className="min-w-0 flex-1 truncate text-xs text-ink-700" title={cell}>
                    {cell.trim() || `${col + 1}번째 칸`}
                  </span>
                  <Select
                    value={mapping[col] ?? ""}
                    className="w-36 shrink-0"
                    aria-label={`${cell || col + 1}번째 칸을 넣을 항목`}
                    onChange={(e) =>
                      setMapping((prev) => {
                        const next = [...prev];
                        next[col] = e.target.value as ColumnTarget;
                        return next;
                      })
                    }
                  >
                    <option value="">사용 안 함</option>
                    {FIELD_OPTIONS.map(([field, label]) => (
                      <option key={field} value={field}>
                        {label}
                      </option>
                    ))}
                  </Select>
                </li>
              ))}
            </ul>
            {!hasName && (
              <Help tone="error">
                상품명으로 쓸 칸을 하나 골라 주세요. 상품명이 없으면 불러올 수 없습니다.
              </Help>
            )}
            {hasName && !hasPrice && (
              <Help tone="error">판매가로 쓸 칸을 골라 주세요. 판매가가 없으면 등록할 수 없습니다.</Help>
            )}
          </section>

          {/* 3) 결과 확인 */}
          {preview && (
            <section>
              <h3 className="text-sm font-semibold text-ink-900">3. 이렇게 읽었습니다</h3>
              <p className="krw mt-1 text-sm text-ink-600">
                줄 {preview.stats.usedRows}개를 상품 {preview.stats.productCount}개
                {preview.stats.variantCount > 0 && ` · 옵션 ${preview.stats.variantCount}개`}로 묶었습니다.
                {preview.stats.emptyRows > 0 && ` 값이 비어 있는 ${preview.stats.emptyRows}줄은 건너뜁니다.`}
              </p>

              {/* 엑셀에 없어 기본값으로 채운 것 — 불러오기 전에 알아야 카드에서 바로 손볼 수 있다 */}
              {preview.notes.map((note) => (
                <p key={note} className="mt-1 text-xs leading-relaxed text-[#8a650e]">
                  {note}
                </p>
              ))}

              <ul className="mt-2 max-h-72 space-y-1.5 overflow-y-auto border border-ink-100 p-3">
                {preview.drafts.map((draft) => (
                  <li key={draft.id} className="text-xs leading-relaxed text-ink-700">
                    <span className="font-medium text-ink-900">{draft.name}</span>
                    <span className="krw">
                      {" — "}
                      {/* 엑셀을 서식대로 읽으면 금액이 "19,200" 으로 들어온다 —
                          Number() 에 그대로 넣으면 NaN 이 화면에 찍힌다. toNumeric 을 거친다. */}
                      {toNumeric(draft.price) != null
                        ? `${toNumeric(draft.price)!.toLocaleString("ko-KR")}원`
                        : "판매가 없음"}
                      {toNumeric(draft.costPrice) != null &&
                        ` · 원가 ${toNumeric(draft.costPrice)!.toLocaleString("ko-KR")}원`}
                      {draft.weight && ` · ${draft.weight}`}
                      {draft.variants.length > 0 &&
                        ` · 옵션 ${draft.variants.length}개(${draft.variants.map((v) => v.name).join("/")})`}
                    </span>
                    <span className="block text-ink-400">주소 {draft.slug || "(정해야 함)"}</span>
                    {draft.notes.map((note) => (
                      <span key={note} className="block text-[#8a650e]">
                        {note}
                      </span>
                    ))}
                  </li>
                ))}
                {preview.drafts.length === 0 && (
                  <li className="py-4 text-center text-xs text-ink-400">
                    읽어 낸 상품이 없습니다. 위에서 제목 줄과 칸 대응을 확인해 주세요.
                  </li>
                )}
              </ul>

              {preview.queued.length > 0 && (
                <Help tone="error">
                  한 번에 {MAX_PRODUCTS}개까지만 화면에 올릴 수 있습니다. 나머지 {preview.queued.length}개는
                  대기열에 넣어 두었다가 이번 등록을 끝낸 뒤 이어서 불러올 수 있습니다.
                </Help>
              )}
              {preview.stats.totalRows >= MAX_SHEET_ROWS && (
                <Help tone="error">
                  엑셀은 한 번에 {MAX_SHEET_ROWS}줄까지 읽습니다. 그보다 긴 표는 나눠서 올려 주세요.
                </Help>
              )}

              <button
                type="button"
                disabled={preview.drafts.length === 0 || !hasName}
                onClick={() => onConfirm(preview)}
                className={`${BTN_PRIMARY} mt-3`}
              >
                이대로 {preview.drafts.length}개 불러오기
              </button>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
