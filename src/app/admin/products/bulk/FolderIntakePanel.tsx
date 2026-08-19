"use client";

/* ============================================================
   이미지 폴더 통째로 올리기

   실제 자산은 `수다락 상세페이지/` 아래 193개 파일이 상품별 폴더로 정리돼 있다.
   그런데 옛 화면은 폴더 드래그를 아예 지원하지 않아, 카드마다 폴더를 열고
   파일을 골라 넣는 일을 193번 반복해야 했다. 화면에는 "드라이브처럼 끌어넣어"
   라고 적혀 있었으니 안내와 동작이 정반대였다.

   여기서는 폴더를 재귀로 훑어 (폴더명 → 상품, 파일 → 용도) 로 자동 배정하고,
   **올리기 전에** 그 배정을 표로 보여 준다. 짝이 틀린 폴더만 바꿔 주면 된다.

   ⚠ 이 화면의 숫자는 **약속**이다. 예전에는 요약을 파일명 규칙으로 세고 실제 배정은
   업로드 직전 세로비로 정해, "상품 사진 32장" 이라 적어 놓고 11장을 상세로 보냈다.
   그래서 지금은 요약도 업로드도 **같은 목록(resolvedFiles)** 을 본다. 한쪽만 고치면
   또 갈리므로, 이 파일에서 배정을 다시 계산하는 코드를 만들지 마라.
   ============================================================ */

import { useMemo, useRef, useState } from "react";
import { FolderOpen, Loader2, UploadCloud } from "lucide-react";
import { Help, Select } from "@/components/admin/Field";
import { BTN_GHOST, BTN_PRIMARY } from "../product-ui";
import {
  collectFromDrop,
  collectFromInput,
  planAssignment,
  summarizeByFolder,
  type AssignedFile,
  type AssignmentPlan,
  type ImageLane,
  type PickedFile,
} from "./bulk-folder";
import { resolveLane } from "./bulk-lane";
import { ingestFiles, progressText, type IngestProgress } from "./bulk-ingest";
import type { DraftImage, ProductDraft } from "./bulk-types";

export interface FolderApplyResult {
  draftId: string;
  gallery: DraftImage[];
  detail: DraftImage[];
  /** 이 상품에서 생긴 안내 — 어느 상품 이야기인지 잃지 않도록 상품별로 들고 간다 */
  notes: string[];
}

export interface FolderIntakePanelProps {
  drafts: ProductDraft[];
  onApply: (results: FolderApplyResult[], noteCount: number, failures: string[]) => void;
}

/** 폴더별로 사람이 바꾼 값 */
interface FolderOverride {
  draftId: string | null;
  /** "auto" 면 훑을 때 정한 배정을 그대로 쓴다 */
  lane: ImageLane | "auto";
}

export default function FolderIntakePanel({ drafts, onApply }: FolderIntakePanelProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [plan, setPlan] = useState<AssignmentPlan | null>(null);
  /** 폴더의 전체 경로를 키로 쓴다 — 폴더 '이름' 을 키로 쓰면 다른 상품 폴더가 함께 바뀐다 */
  const [overrides, setOverrides] = useState<Record<string, FolderOverride>>({});
  const [dragging, setDragging] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanned, setScanned] = useState<{ done: number; total: number } | null>(null);
  const [progress, setProgress] = useState<IngestProgress | null>(null);
  const [overall, setOverall] = useState<{ done: number; total: number } | null>(null);

  /**
   * 사람이 고른 값까지 얹은 **최종 배정**. 요약과 업로드가 함께 보는 단 하나의 목록이다.
   * 세로로 매우 긴 사진은 사람이 '모두 상품 사진' 을 골라도 상세로 간다 — 서버도 같은
   * 판정을 하므로, 여기서 다르게 약속하면 저장 뒤에 뒤집힌다.
   */
  const resolvedFiles = useMemo<AssignedFile[]>(() => {
    if (!plan) return [];
    return plan.files.map((item) => {
      const decision = overrides[item.dir] ?? { draftId: item.draftId, lane: "auto" as const };
      return { ...item, draftId: decision.draftId, lane: resolveLane(item, item.lane, decision.lane) };
    });
  }, [plan, overrides]);

  const summaries = useMemo(() => summarizeByFolder(resolvedFiles), [resolvedFiles]);

  /** 폴더의 현재 선택 — 사람이 바꾼 값이 있으면 그것을 쓴다 */
  function decisionOf(dir: string, fallbackDraftId: string | null): FolderOverride {
    return overrides[dir] ?? { draftId: fallbackDraftId, lane: "auto" };
  }

  async function scan(picked: PickedFile[] | Promise<PickedFile[]>) {
    setScanning(true);
    setScanned(null);
    try {
      const files = await picked;
      const next = await planAssignment(files, drafts, (done, total) => {
        // 193장을 한 장마다 다시 그리면 훑는 시간보다 렌더가 더 걸린다 — 10장 단위로만 알린다
        if (done % 10 === 0 || done === total) setScanned({ done, total });
      });
      setPlan(next);
      setOverrides({});
    } finally {
      setScanning(false);
      setScanned(null);
    }
  }

  function reset() {
    setPlan(null);
    setOverrides({});
    setOverall(null);
  }

  async function upload() {
    // 폴더·용도별로 파일을 모은 뒤, 상품 하나씩 순서대로 올린다.
    const buckets = new Map<string, { gallery: File[]; detail: File[] }>();
    for (const item of resolvedFiles) {
      if (!item.draftId) continue;
      const bucket = buckets.get(item.draftId) ?? { gallery: [], detail: [] };
      bucket[item.lane].push(item.file);
      buckets.set(item.draftId, bucket);
    }

    const total = [...buckets.values()].reduce((sum, b) => sum + b.gallery.length + b.detail.length, 0);
    if (total === 0) return;

    let done = 0;
    setOverall({ done: 0, total });

    const results: FolderApplyResult[] = [];
    const failures: string[] = [];
    let noteCount = 0;

    for (const [draftId, bucket] of buckets) {
      const gallery: DraftImage[] = [];
      const detail: DraftImage[] = [];
      const notes: string[] = [];

      for (const [lane, files] of [
        ["gallery", bucket.gallery],
        ["detail", bucket.detail],
      ] as [ImageLane, File[]][]) {
        if (files.length === 0) continue;
        // 배정은 이미 확인 화면에서 치수까지 재서 정했다 — 다시 묻지 않는다
        const outcome = await ingestFiles(files, lane, `bulk/${draftId}/${lane}`, setProgress, {
          laneDecided: true,
        });
        gallery.push(...outcome.gallery);
        detail.push(...outcome.detail);
        notes.push(...outcome.notes);
        failures.push(...outcome.failures);
        done += files.length;
        setOverall({ done, total });
      }

      noteCount += notes.length;
      results.push({ draftId, gallery, detail, notes });
    }

    setProgress(null);
    setOverall(null);
    onApply(results, noteCount, failures);
    reset();
  }

  const plannedCount = resolvedFiles.filter((item) => item.draftId).length;
  const orphanCount = resolvedFiles.length - plannedCount;
  const detailCount = resolvedFiles.filter((item) => item.draftId && item.lane === "detail").length;

  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void scan(collectFromDrop(e.dataTransfer));
        }}
        className={`border border-dashed p-6 text-center transition-colors ${
          dragging ? "border-forest-700 bg-forest-50" : "border-ink-300 bg-cream-50"
        }`}
      >
        {scanning ? (
          <p className="flex items-center justify-center gap-2 text-sm text-ink-600">
            <Loader2 size={18} strokeWidth={1.5} className="animate-spin" />
            {scanned
              ? `사진 크기를 확인하는 중입니다… ${scanned.done}/${scanned.total}장`
              : "폴더 안을 살펴보는 중입니다…"}
          </p>
        ) : (
          <>
            <FolderOpen size={26} strokeWidth={1.5} className="mx-auto text-ink-400" />
            <p className="mt-2 text-sm text-ink-700">상품별 폴더를 통째로 여기에 끌어다 놓으세요</p>
            <p className="mt-1 text-xs text-ink-400">
              폴더 이름으로 상품을 찾고, 사진 모양과 이름으로 상품 사진과 상세페이지 사진을 나눕니다.
            </p>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className={`${BTN_GHOST} mt-3 inline-flex items-center gap-2`}
            >
              <UploadCloud size={15} strokeWidth={1.5} />
              폴더 고르기
            </button>
          </>
        )}
      </div>

      {/* webkitdirectory 는 표준 React 속성이 아니라 DOM 에 직접 달아 준다 */}
      <input
        ref={(el) => {
          inputRef.current = el;
          if (el) {
            el.setAttribute("webkitdirectory", "");
            el.setAttribute("directory", "");
          }
        }}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          const picked = collectFromInput(e.target.files ?? []);
          void scan(picked);
          e.target.value = "";
        }}
      />

      {plan && resolvedFiles.length > 0 && (
        <div className="space-y-3 border-t border-ink-100 pt-4">
          <p className="krw text-sm text-ink-600">
            사진 {resolvedFiles.length}장을 올릴 준비가 됐습니다. 그중 {detailCount}장은 상세페이지로 들어갑니다.
            {orphanCount > 0 && ` ${orphanCount}장은 어느 상품인지 몰라 아직 올리지 않습니다.`}
          </p>
          {plan.dropped > 0 && (
            <p className="text-xs text-ink-400">
              같은 사진의 작은 사본 {plan.dropped}장은 빼고 가장 큰 것만 올립니다.
            </p>
          )}
          {plan.unmeasured > 0 && (
            <p className="text-xs text-ink-400">
              {plan.unmeasured}장은 크기를 미리 확인하지 못했습니다. 올리는 중에 다시 살펴보고, 세로로 매우 길면
              상세페이지 칸으로 옮깁니다.
            </p>
          )}

          <ul className="max-h-80 space-y-2 overflow-y-auto">
            {summaries.map((summary) => {
              const decision = decisionOf(summary.dir, summary.draftId);
              return (
                <li
                  key={summary.dir}
                  className="flex flex-wrap items-center gap-2 border border-ink-100 bg-cream-100/50 px-3 py-2"
                >
                  <span className="min-w-0 flex-1 truncate text-xs text-ink-700" title={summary.dir}>
                    {summary.folder || "(폴더 없이 올린 사진)"}
                    <span className="krw ml-1.5 text-ink-400">
                      상품 사진 {summary.galleryCount}장 · 상세 {summary.detailCount}장
                    </span>
                  </span>

                  <Select
                    value={decision.draftId ?? ""}
                    className="w-44 shrink-0"
                    aria-label={`${summary.folder} 폴더를 넣을 상품`}
                    onChange={(e) =>
                      setOverrides((prev) => ({
                        ...prev,
                        [summary.dir]: { ...decision, draftId: e.target.value || null },
                      }))
                    }
                  >
                    <option value="">올리지 않음</option>
                    {drafts.map((draft, i) => (
                      <option key={draft.id} value={draft.id}>
                        {draft.name.trim() || `이름 없는 상품 ${i + 1}`}
                      </option>
                    ))}
                  </Select>

                  <Select
                    value={decision.lane}
                    className="w-32 shrink-0"
                    aria-label={`${summary.folder} 폴더 사진의 용도`}
                    onChange={(e) =>
                      setOverrides((prev) => ({
                        ...prev,
                        [summary.dir]: { ...decision, lane: e.target.value as ImageLane | "auto" },
                      }))
                    }
                  >
                    <option value="auto">자동으로 나누기</option>
                    <option value="gallery">모두 상품 사진</option>
                    <option value="detail">모두 상세페이지</option>
                  </Select>
                </li>
              );
            })}
          </ul>

          {drafts.length === 0 && (
            <Help tone="error">먼저 상품 카드를 만들거나 엑셀을 불러온 뒤에 폴더를 올려 주세요.</Help>
          )}

          {overall ? (
            <div>
              <p className="krw text-sm text-ink-700">
                전체 {overall.total}장 중 {overall.done}장 올렸습니다.
              </p>
              {progress && <p className="mt-1 text-xs text-ink-500">{progressText(progress)} — {progress.fileName}</p>}
              <div className="mt-2 h-1 w-full bg-ink-100">
                <div
                  className="h-full bg-forest-700 transition-all duration-300"
                  style={{ width: `${Math.round((overall.done / Math.max(1, overall.total)) * 100)}%` }}
                />
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void upload()}
                disabled={plannedCount === 0}
                className={BTN_PRIMARY}
              >
                이대로 {plannedCount}장 올리기
              </button>
              <button type="button" onClick={reset} className={BTN_GHOST}>
                취소
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
