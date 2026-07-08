"use client";

import { useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Download,
  ImagePlus,
  Loader2,
  Plus,
  Send,
  Trash2,
  UploadCloud,
  X,
  XCircle,
} from "lucide-react";
import { Help, Input, Select, Textarea, Toggle } from "@/components/admin/Field";
import { krw, slugify } from "@/lib/format";
import type { Category, StorageType } from "@/lib/types";
import { BTN_GHOST, BTN_PRIMARY } from "../product-ui";

type UploadedImage = { url: string; name?: string };

interface ProductDraft {
  id: string;
  name: string;
  category: string;
  price: string;
  stock: string;
  storage_type: StorageType;
  origin: string;
  weight: string;
  units_per_pack: string;
  description: string;
  primaryImages: UploadedImage[];
  detailImages: UploadedImage[];
  status: "draft" | "active";
  expanded: boolean;
  subtitle: string;
  sku: string;
  compare_at_price: string;
  badges: string;
  tags: string;
  nutrition: string;
  specs: string;
}

interface BulkResult {
  row_no: number;
  name: string | null;
  slug: string | null;
  ok: boolean;
  product_id?: string;
  warnings: string[];
  errors: string[];
}

interface BulkResponse {
  okCount: number;
  failedCount: number;
  results: BulkResult[];
  error?: string;
}

const MAX_PRODUCTS = 50;
const MAX_SIZE_MB = 5;

const SAMPLE_HEADERS = [
  "상품명",
  "카테고리",
  "판매가",
  "재고",
  "보관",
  "원산지",
  "중량",
  "구성수량",
  "상품설명",
];

function makeId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function emptyDraft(): ProductDraft {
  return {
    id: makeId(),
    name: "",
    category: "",
    price: "",
    stock: "0",
    storage_type: "room",
    origin: "국내산",
    weight: "",
    units_per_pack: "1",
    description: "",
    primaryImages: [],
    detailImages: [],
    status: "draft",
    expanded: false,
    subtitle: "",
    sku: "",
    compare_at_price: "",
    badges: "",
    tags: "",
    nutrition: "",
    specs: "",
  };
}

function normalizeHeader(header: string): string {
  const key = header.trim().replace(/\s/g, "");
  const map: Record<string, string> = {
    상품명: "name",
    이름: "name",
    카테고리: "category",
    판매가: "price",
    가격: "price",
    재고: "stock",
    보관: "storage_type",
    보관방법: "storage_type",
    원산지: "origin",
    중량: "weight",
    구성수량: "units_per_pack",
    구성: "units_per_pack",
    상품설명: "description",
    설명: "description",
    한줄소개: "subtitle",
    SKU: "sku",
  };
  return map[key] ?? header.trim();
}

function normalizeStorage(value: string): StorageType {
  const trimmed = value.trim().toLowerCase();
  if (["냉장", "chilled"].includes(trimmed)) return "chilled";
  if (["냉동", "frozen"].includes(trimmed)) return "frozen";
  return "room";
}

async function parseSimpleSheet(file: File): Promise<ProductDraft[]> {
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });

  return rows
    .map((raw) => {
      const normalized: Record<string, string> = {};
      for (const [header, value] of Object.entries(raw)) {
        normalized[normalizeHeader(header)] = String(value ?? "").trim();
      }
      if (!normalized.name) return null;
      return {
        ...emptyDraft(),
        name: normalized.name,
        category: normalized.category ?? "",
        price: normalized.price ?? "",
        stock: normalized.stock || "0",
        storage_type: normalizeStorage(normalized.storage_type ?? ""),
        origin: normalized.origin || "국내산",
        weight: normalized.weight ?? "",
        units_per_pack: normalized.units_per_pack || "1",
        description: normalized.description ?? "",
        subtitle: normalized.subtitle ?? "",
        sku: normalized.sku ?? "",
      };
    })
    .filter((row): row is ProductDraft => row != null);
}

function toList(value: string): string[] {
  return value
    .split(/[|,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function toApiRow(draft: ProductDraft, index: number) {
  return {
    row_no: index + 2,
    name: draft.name,
    slug: slugify(draft.name),
    category: draft.category,
    subtitle: draft.subtitle,
    description: draft.description,
    detail_image_urls: draft.detailImages.map((image) => image.url),
    price: Number(draft.price),
    compare_at_price: draft.compare_at_price ? Number(draft.compare_at_price) : undefined,
    sku: draft.sku || undefined,
    stock: Number(draft.stock || 0),
    low_stock_threshold: 10,
    status: draft.status,
    storage_type: draft.storage_type,
    origin: draft.origin,
    weight: draft.weight,
    units_per_pack: Number(draft.units_per_pack || 1),
    primary_image_urls: draft.primaryImages.map((image) => image.url),
    badges: toList(draft.badges),
    tags: toList(draft.tags),
    nutrition: draft.nutrition,
    specs: draft.specs,
  };
}

function resultTone(result?: BulkResult): string {
  if (!result) return "border-ink-200 bg-cream-50 text-ink-400";
  if (!result.ok) return "border-signal-red bg-[#f8eee9] text-signal-red";
  if (result.warnings.length > 0) return "border-signal-amber bg-[#faf3df] text-[#8a650e]";
  return "border-forest-200 bg-forest-50 text-forest-700";
}

async function uploadImage(file: File, prefix: string): Promise<UploadedImage> {
  if (!file.type.startsWith("image/")) throw new Error("이미지 파일만 업로드할 수 있습니다.");
  if (file.size > MAX_SIZE_MB * 1024 * 1024) {
    throw new Error(`이미지는 파일당 ${MAX_SIZE_MB}MB 이하로 올려 주세요.`);
  }

  const form = new FormData();
  form.append("file", file);
  form.append("bucket", "products");
  form.append("prefix", prefix);

  const res = await fetch("/api/admin/upload", { method: "POST", body: form });
  const data = (await res.json().catch(() => null)) as { url?: string; error?: string } | null;
  if (!res.ok || !data?.url) throw new Error(data?.error ?? "이미지 업로드에 실패했습니다.");
  return { url: data.url, name: file.name };
}

interface DriveImageUploaderProps {
  label: string;
  helper: string;
  value: UploadedImage[];
  onChange: (next: UploadedImage[]) => void;
  prefix: string;
  multiple?: boolean;
}

function DriveImageUploader({
  label,
  helper,
  value,
  onChange,
  prefix,
  multiple = true,
}: DriveImageUploaderProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFiles(files: FileList | File[]) {
    const list = Array.from(files);
    if (list.length === 0) return;
    setError(null);
    setUploading(true);
    try {
      const selected = multiple ? list : list.slice(0, 1);
      const uploaded: UploadedImage[] = [];
      for (const file of selected) {
        uploaded.push(await uploadImage(file, prefix));
      }
      onChange(multiple ? [...value, ...uploaded] : uploaded);
    } catch (e) {
      setError(e instanceof Error ? e.message : "이미지 업로드에 실패했습니다.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function remove(index: number) {
    onChange(value.filter((_, i) => i !== index));
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-ink-900">{label}</p>
          <p className="mt-0.5 text-xs text-ink-400">{helper}</p>
        </div>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="inline-flex shrink-0 items-center gap-1.5 border border-ink-200 px-3 py-2 text-xs text-ink-700 transition-colors hover:bg-cream-100"
        >
          <ImagePlus size={15} strokeWidth={1.5} />
          추가
        </button>
      </div>

      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          void handleFiles(event.dataTransfer.files);
        }}
        className={`min-h-36 border border-dashed p-3 transition-colors ${
          dragging ? "border-forest-700 bg-forest-50" : "border-ink-300 bg-cream-50"
        }`}
      >
        {value.length === 0 && !uploading ? (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex min-h-28 w-full flex-col items-center justify-center gap-2 text-ink-400 transition-colors hover:text-forest-700"
          >
            <UploadCloud size={24} strokeWidth={1.5} />
            <span className="text-sm">이미지를 여기에 끌어오거나 선택</span>
          </button>
        ) : (
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {value.map((image, index) => (
              <figure key={`${image.url}-${index}`} className="group relative aspect-square overflow-hidden border border-ink-200 bg-cream-100">
                <Image src={image.url} alt={image.name ?? label} fill sizes="120px" className="object-cover" />
                {index === 0 && label.includes("대표") && (
                  <figcaption className="absolute left-0 top-0 bg-forest-900/85 px-2 py-0.5 text-[10px] text-cream-50">
                    대표
                  </figcaption>
                )}
                <button
                  type="button"
                  onClick={() => remove(index)}
                  aria-label="이미지 삭제"
                  className="absolute right-1 top-1 bg-ink-900/60 p-1 text-cream-50 opacity-0 transition-opacity group-hover:opacity-100"
                >
                  <X size={14} strokeWidth={1.5} />
                </button>
              </figure>
            ))}
            {uploading && (
              <div className="flex aspect-square items-center justify-center border border-ink-200 bg-cream-100">
                <Loader2 size={20} strokeWidth={1.5} className="animate-spin text-forest-700" />
              </div>
            )}
          </div>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple={multiple}
        className="hidden"
        onChange={(event) => {
          if (event.target.files) void handleFiles(event.target.files);
        }}
      />

      {error && <Help tone="error">{error}</Help>}
    </div>
  );
}

export default function BulkProductImportClient({ categories }: { categories: Category[] }) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [drafts, setDrafts] = useState<ProductDraft[]>([emptyDraft()]);
  const [results, setResults] = useState<BulkResult[]>([]);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [showExcel, setShowExcel] = useState(false);

  const resultMap = useMemo(() => new Map(results.map((result) => [result.row_no, result])), [results]);
  const validDrafts = drafts.filter((draft) => draft.name.trim());

  function patchDraft(id: string, patch: Partial<ProductDraft>) {
    setDrafts((items) => items.map((item) => (item.id === id ? { ...item, ...patch } : item)));
    setResults([]);
  }

  function addDraft() {
    if (drafts.length >= MAX_PRODUCTS) return;
    setDrafts((items) => [...items, emptyDraft()]);
  }

  function removeDraft(id: string) {
    setDrafts((items) => (items.length <= 1 ? [emptyDraft()] : items.filter((item) => item.id !== id)));
    setResults([]);
  }

  async function downloadTemplate() {
    const XLSX = await import("xlsx");
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([
      SAMPLE_HEADERS,
      ["발효곤약면 소면", "noodle", 12900, 100, "상온", "국내산", "200g x 2팩", 2, "쫄깃한 저칼로리 곤약 소면"],
    ]);
    XLSX.utils.book_append_sheet(workbook, sheet, "상품 기본정보");
    XLSX.writeFile(workbook, "daleum-simple-products.xlsx");
  }

  async function importExcel(file: File) {
    setMessage(null);
    try {
      const imported = await parseSimpleSheet(file);
      if (imported.length === 0) {
        setMessage({ tone: "error", text: "불러올 상품이 없습니다. 첫 줄의 헤더와 상품명을 확인해 주세요." });
        return;
      }
      setDrafts(imported.slice(0, MAX_PRODUCTS));
      setResults([]);
      setShowExcel(false);
      setMessage({ tone: "ok", text: `${imported.length}개 상품 기본 정보를 불러왔습니다. 이미지는 각 상품 카드에서 올려 주세요.` });
    } catch {
      setMessage({ tone: "error", text: "엑셀 파일을 읽지 못했습니다. 간편 양식을 다시 받아 작성해 주세요." });
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function validateLocal(): string | null {
    if (validDrafts.length === 0) return "상품명을 입력한 상품이 없습니다.";
    for (const [index, draft] of validDrafts.entries()) {
      const label = `${index + 1}번 상품`;
      if (!draft.name.trim()) return `${label}의 상품명을 입력해 주세요.`;
      if (!draft.price || !Number.isInteger(Number(draft.price))) return `${label}의 판매가를 숫자로 입력해 주세요.`;
      if (!Number.isInteger(Number(draft.stock || 0))) return `${label}의 재고를 숫자로 입력해 주세요.`;
      if (draft.primaryImages.length === 0) return `${label}에 대표 이미지를 1장 이상 올려 주세요.`;
    }
    return null;
  }

  async function submit(mode: "validate" | "create") {
    const localError = validateLocal();
    if (localError) {
      setMessage({ tone: "error", text: localError });
      return;
    }
    if (mode === "create" && !window.confirm(`${validDrafts.length}개 상품을 등록할까요?`)) return;

    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/products/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          products: validDrafts.map(toApiRow),
        }),
      });
      const data = (await res.json().catch(() => null)) as BulkResponse | null;
      if (!res.ok || !data) throw new Error(data?.error ?? "요청에 실패했습니다.");
      setResults(data.results);
      setMessage({
        tone: data.failedCount === 0 ? "ok" : "error",
        text:
          mode === "create"
            ? `등록 ${krw(data.okCount)}건, 실패 ${krw(data.failedCount)}건`
            : `검증 통과 ${krw(data.okCount)}건, 확인 필요 ${krw(data.failedCount)}건`,
      });
    } catch (e) {
      setMessage({ tone: "error", text: e instanceof Error ? e.message : "요청에 실패했습니다." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <Link href="/admin/products" className="text-xs text-ink-400 transition-colors hover:text-forest-700">
            상품 목록으로
          </Link>
          <h1 className="mt-1 text-xl font-semibold text-ink-900">상품 일괄 등록</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-500">
            상품을 카드처럼 추가하고 이미지는 드라이브처럼 끌어넣어 등록합니다.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={addDraft} className={`${BTN_GHOST} inline-flex items-center gap-2`}>
            <Plus size={16} strokeWidth={1.5} />
            상품 추가
          </button>
          <button
            type="button"
            onClick={() => void submit("validate")}
            disabled={busy}
            className={`${BTN_GHOST} inline-flex items-center gap-2`}
          >
            <CheckCircle2 size={16} strokeWidth={1.5} />
            검증
          </button>
          <button
            type="button"
            onClick={() => void submit("create")}
            disabled={busy}
            className={`${BTN_PRIMARY} inline-flex items-center gap-2`}
          >
            {busy ? <Loader2 size={16} strokeWidth={1.5} className="animate-spin" /> : <Send size={16} strokeWidth={1.5} />}
            등록
          </button>
        </div>
      </div>

      {message && (
        <p
          role="status"
          className={`mb-4 border px-4 py-3 text-sm ${
            message.tone === "ok"
              ? "border-forest-200 bg-forest-50 text-forest-700"
              : "border-ink-200 bg-cream-100 text-signal-red"
          }`}
        >
          {message.text}
        </p>
      )}

      <section className="mb-5 border border-ink-200 bg-cream-50">
        <button
          type="button"
          onClick={() => setShowExcel((open) => !open)}
          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
        >
          <span>
            <span className="block text-sm font-semibold text-ink-900">엑셀로 기본 정보 불러오기</span>
            <span className="mt-0.5 block text-xs text-ink-400">이미지는 엑셀에 넣지 않고, 불러온 뒤 상품 카드에서 업로드합니다.</span>
          </span>
          {showExcel ? <ChevronUp size={18} strokeWidth={1.5} /> : <ChevronDown size={18} strokeWidth={1.5} />}
        </button>
        {showExcel && (
          <div className="flex flex-wrap items-center gap-2 border-t border-ink-100 px-4 py-4">
            <button type="button" onClick={downloadTemplate} className={`${BTN_GHOST} inline-flex items-center gap-2`}>
              <Download size={16} strokeWidth={1.5} />
              간편 양식 받기
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv,.tsv"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void importExcel(file);
              }}
            />
            <button type="button" onClick={() => fileInputRef.current?.click()} className={`${BTN_PRIMARY} inline-flex items-center gap-2`}>
              <UploadCloud size={16} strokeWidth={1.5} />
              작성한 엑셀 불러오기
            </button>
          </div>
        )}
      </section>

      <div className="mb-4 grid grid-cols-3 gap-3">
        <div className="border border-ink-200 bg-cream-50 p-4">
          <p className="label-caps text-ink-400">Products</p>
          <p className="krw mt-2 text-2xl font-semibold text-ink-900">{krw(validDrafts.length)}</p>
        </div>
        <div className="border border-ink-200 bg-cream-50 p-4">
          <p className="label-caps text-ink-400">Images</p>
          <p className="krw mt-2 text-2xl font-semibold text-ink-900">
            {krw(drafts.reduce((sum, draft) => sum + draft.primaryImages.length + draft.detailImages.length, 0))}
          </p>
        </div>
        <div className="border border-ink-200 bg-cream-50 p-4">
          <p className="label-caps text-ink-400">Passed</p>
          <p className="krw mt-2 text-2xl font-semibold text-forest-700">
            {krw(results.filter((result) => result.ok).length)}
          </p>
        </div>
      </div>

      <div className="space-y-5">
        {drafts.map((draft, index) => {
          const result = resultMap.get(index + 2);
          return (
            <section key={draft.id} className="border border-ink-200 bg-cream-50">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-ink-100 px-4 py-3">
                <div>
                  <p className="label-caps text-ink-400">Product {index + 1}</p>
                  <h2 className="mt-1 text-base font-semibold text-ink-900">
                    {draft.name.trim() || "새 상품"}
                  </h2>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center gap-1 border px-2.5 py-1 text-xs ${resultTone(result)}`}>
                    {result ? (
                      result.ok ? (
                        result.warnings.length > 0 ? (
                          <AlertTriangle size={13} strokeWidth={1.5} />
                        ) : (
                          <CheckCircle2 size={13} strokeWidth={1.5} />
                        )
                      ) : (
                        <XCircle size={13} strokeWidth={1.5} />
                      )
                    ) : (
                      <AlertTriangle size={13} strokeWidth={1.5} />
                    )}
                    {result ? (result.ok ? "통과" : "확인 필요") : "미검증"}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeDraft(draft.id)}
                    aria-label="상품 삭제"
                    className="p-2 text-ink-400 transition-colors hover:text-signal-red"
                  >
                    <Trash2 size={17} strokeWidth={1.5} />
                  </button>
                </div>
              </div>

              <div className="grid gap-5 p-4 xl:grid-cols-[minmax(0,1fr)_minmax(30rem,0.9fr)]">
                <div className="space-y-4">
                  <div className="grid gap-3 md:grid-cols-2">
                    <label>
                      <span className="mb-1.5 block text-[13px] font-medium text-ink-700">상품명 *</span>
                      <Input value={draft.name} onChange={(event) => patchDraft(draft.id, { name: event.target.value })} />
                    </label>
                    <label>
                      <span className="mb-1.5 block text-[13px] font-medium text-ink-700">카테고리</span>
                      <Select value={draft.category} onChange={(event) => patchDraft(draft.id, { category: event.target.value })}>
                        <option value="">미분류</option>
                        {categories.map((category) => (
                          <option key={category.id} value={category.id}>
                            {category.name}
                          </option>
                        ))}
                      </Select>
                    </label>
                    <label>
                      <span className="mb-1.5 block text-[13px] font-medium text-ink-700">판매가 *</span>
                      <Input inputMode="numeric" value={draft.price} onChange={(event) => patchDraft(draft.id, { price: event.target.value })} />
                    </label>
                    <label>
                      <span className="mb-1.5 block text-[13px] font-medium text-ink-700">초기 재고 *</span>
                      <Input inputMode="numeric" value={draft.stock} onChange={(event) => patchDraft(draft.id, { stock: event.target.value })} />
                    </label>
                    <label>
                      <span className="mb-1.5 block text-[13px] font-medium text-ink-700">보관 방법</span>
                      <Select value={draft.storage_type} onChange={(event) => patchDraft(draft.id, { storage_type: event.target.value as StorageType })}>
                        <option value="room">상온</option>
                        <option value="chilled">냉장</option>
                        <option value="frozen">냉동</option>
                      </Select>
                    </label>
                    <label>
                      <span className="mb-1.5 block text-[13px] font-medium text-ink-700">원산지</span>
                      <Input value={draft.origin} onChange={(event) => patchDraft(draft.id, { origin: event.target.value })} />
                    </label>
                    <label>
                      <span className="mb-1.5 block text-[13px] font-medium text-ink-700">중량</span>
                      <Input value={draft.weight} onChange={(event) => patchDraft(draft.id, { weight: event.target.value })} placeholder="200g x 2팩" />
                    </label>
                    <label>
                      <span className="mb-1.5 block text-[13px] font-medium text-ink-700">구성 수량</span>
                      <Input inputMode="numeric" value={draft.units_per_pack} onChange={(event) => patchDraft(draft.id, { units_per_pack: event.target.value })} />
                    </label>
                  </div>

                  <label className="block">
                    <span className="mb-1.5 block text-[13px] font-medium text-ink-700">상품 설명</span>
                    <Textarea
                      rows={5}
                      value={draft.description}
                      onChange={(event) => patchDraft(draft.id, { description: event.target.value })}
                      placeholder="상품 특징, 조리법, 맛과 식감 등을 자유롭게 적어 주세요."
                    />
                  </label>

                  <button
                    type="button"
                    onClick={() => patchDraft(draft.id, { expanded: !draft.expanded })}
                    className="inline-flex items-center gap-1.5 text-sm text-ink-500 transition-colors hover:text-forest-700"
                  >
                    {draft.expanded ? <ChevronUp size={16} strokeWidth={1.5} /> : <ChevronDown size={16} strokeWidth={1.5} />}
                    추가 정보
                  </button>

                  {draft.expanded && (
                    <div className="grid gap-3 border-t border-ink-100 pt-4 md:grid-cols-2">
                      <label>
                        <span className="mb-1.5 block text-[13px] font-medium text-ink-700">한줄 소개</span>
                        <Input value={draft.subtitle} onChange={(event) => patchDraft(draft.id, { subtitle: event.target.value })} />
                      </label>
                      <label>
                        <span className="mb-1.5 block text-[13px] font-medium text-ink-700">SKU</span>
                        <Input value={draft.sku} onChange={(event) => patchDraft(draft.id, { sku: event.target.value })} />
                      </label>
                      <label>
                        <span className="mb-1.5 block text-[13px] font-medium text-ink-700">정가</span>
                        <Input inputMode="numeric" value={draft.compare_at_price} onChange={(event) => patchDraft(draft.id, { compare_at_price: event.target.value })} />
                      </label>
                      <label>
                        <span className="mb-1.5 block text-[13px] font-medium text-ink-700">배지</span>
                        <Input value={draft.badges} onChange={(event) => patchDraft(draft.id, { badges: event.target.value })} placeholder="NEW, BEST" />
                      </label>
                      <label>
                        <span className="mb-1.5 block text-[13px] font-medium text-ink-700">태그</span>
                        <Input value={draft.tags} onChange={(event) => patchDraft(draft.id, { tags: event.target.value })} placeholder="저칼로리, 비건" />
                      </label>
                      <label>
                        <span className="mb-1.5 block text-[13px] font-medium text-ink-700">영양 정보</span>
                        <Input value={draft.nutrition} onChange={(event) => patchDraft(draft.id, { nutrition: event.target.value })} placeholder="열량=15kcal|나트륨=10mg" />
                      </label>
                      <label className="md:col-span-2">
                        <span className="mb-1.5 block text-[13px] font-medium text-ink-700">상품 스펙/식품 표시사항</span>
                        <Textarea
                          rows={3}
                          value={draft.specs}
                          onChange={(event) => patchDraft(draft.id, { specs: event.target.value })}
                          placeholder="식품유형=곤약가공품|소비기한=제조일로부터 12개월|보관방법=직사광선을 피해 상온 보관"
                        />
                      </label>
                    </div>
                  )}

                  <Toggle
                    checked={draft.status === "active"}
                    onChange={(checked) => patchDraft(draft.id, { status: checked ? "active" : "draft" })}
                    label="검증 후 바로 판매중으로 등록"
                  />
                </div>

                <div className="space-y-5">
                  <DriveImageUploader
                    label="대표/상품 이미지"
                    helper="첫 이미지가 대표 이미지입니다."
                    value={draft.primaryImages}
                    onChange={(images) => patchDraft(draft.id, { primaryImages: images })}
                    prefix={`bulk/${draft.id}/gallery`}
                  />
                  <DriveImageUploader
                    label="상세페이지 이미지"
                    helper="상세 설명 아래에 순서대로 붙습니다."
                    value={draft.detailImages}
                    onChange={(images) => patchDraft(draft.id, { detailImages: images })}
                    prefix={`bulk/${draft.id}/detail`}
                  />
                </div>
              </div>

              {result && [...result.errors, ...result.warnings].length > 0 && (
                <div className="border-t border-ink-100 px-4 py-3">
                  {result.errors.map((error) => (
                    <p key={error} className="text-sm text-signal-red">
                      {error}
                    </p>
                  ))}
                  {result.warnings.map((warning) => (
                    <p key={warning} className="text-sm text-[#8a650e]">
                      {warning}
                    </p>
                  ))}
                  {result.product_id && (
                    <Link href={`/admin/products/${result.product_id}`} className="mt-2 inline-block text-sm text-forest-700 hover:underline">
                      등록 상품 보기
                    </Link>
                  )}
                </div>
              )}
            </section>
          );
        })}
      </div>

      <div className="sticky bottom-0 z-20 mt-8 flex flex-col gap-3 border-t border-ink-200 bg-cream-50/95 py-4 backdrop-blur-sm sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-ink-500">
          상품 <span className="krw font-medium text-ink-900">{krw(validDrafts.length)}</span>개 준비됨
        </p>
        <div className="flex gap-2">
          <button type="button" onClick={addDraft} className={BTN_GHOST}>
            상품 추가
          </button>
          <button type="button" onClick={() => void submit("validate")} disabled={busy} className={BTN_GHOST}>
            검증
          </button>
          <button type="button" onClick={() => void submit("create")} disabled={busy} className={BTN_PRIMARY}>
            {busy ? "처리 중" : "일괄 등록"}
          </button>
        </div>
      </div>
    </div>
  );
}
