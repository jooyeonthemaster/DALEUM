"use client";

/* ============================================================
   상품 일괄 등록 — 엑셀 한 장 + 이미지 폴더 하나로 신상품 여러 개를 올린다

   이 화면이 다시 만들어진 이유는 units 지시서에 적힌 결함들 때문이다. 요약하면:
   - 회사가 실제 쓰는 품목표를 못 읽었다 (제목 줄이 3번째, 제품명이 병합셀)
   - 10입/20입/30입 같은 옵션을 넣을 방법이 없었다
   - 18MB 상세 원본이 5MB 상한에 막혀 상세페이지 있는 상품은 등록 자체가 불가능했다
   - 검증 배지가 엉뚱한 카드에 붙었다 (배열 순번으로 결과를 찾았다)
   - 한글 상품명의 주소가 item-0zh902d13retid 가 되고 그 코드가 오류 문구에 노출됐다
   - 일부만 성공하면 복구할 길이 없었다

   해결 방식은 크게 둘이다.
   (1) **추측한 것은 반드시 사람에게 먼저 보여 준다** — 엑셀 해석도 폴더 배정도
       확인 화면을 거치고, 틀린 것만 고쳐서 확정한다.
   (2) **결과는 초안 고유 id 로 잇는다** — 배열 순번은 빈 카드 하나에도 어긋난다.
   ============================================================ */

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { Category } from "@/lib/types";
import DraftCard from "./DraftCard";
import { MAX_GALLERY_IMAGES } from "./DraftImageLane";
import IntakeSections from "./IntakeSections";
import type { FolderApplyResult } from "./FolderIntakePanel";
import { dedupeSlug, proposeSlug } from "./bulk-slug";
import type { SheetImportResult } from "./bulk-sheet";
import {
  MAX_PRODUCTS,
  emptyDraft,
  type BulkResult,
  type DraftIssue,
  type ProductDraft,
} from "./bulk-types";

import {
  CHUNK,
  EMPTY_SUBSCRIBE,
  STORAGE_KEY,
  chunk,
  collectIssues,
  forgetSavedSnapshot,
  importMessage,
  mergeFolderImages,
  parseSaved,
  postBulk,
  readSavedOnce,
  summarizeResults,
  toApiRow,
} from "./bulk-submit";
import BulkStatusPanels from "./BulkStatusPanels";
import BulkNotices from "./BulkNotices";
import BulkConfirmDialogs from "./BulkConfirmDialogs";
import { BulkHeader, BulkStickyBar } from "./BulkActionBars";

export default function BulkProductImportClient({ categories }: { categories: Category[] }) {
  const [drafts, setDrafts] = useState<ProductDraft[]>([emptyDraft()]);
  /** 50개를 넘겨 이번 차례에 못 담은 몫 */
  const [queued, setQueued] = useState<ProductDraft[]>([]);
  const [results, setResults] = useState<BulkResult[]>([]);
  const [issues, setIssues] = useState<DraftIssue[]>([]);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<{ done: number; total: number } | null>(null);
  const [showSheet, setShowSheet] = useState(false);
  const [showFolder, setShowFolder] = useState(false);
  const [confirmCreate, setConfirmCreate] = useState(false);
  const [pendingImport, setPendingImport] = useState<SheetImportResult | null>(null);
  const [restoreHandled, setRestoreHandled] = useState(false);

  const savedRaw = useSyncExternalStore(EMPTY_SUBSCRIBE, readSavedOnce, () => null);
  const restorable = restoreHandled ? null : parseSaved(savedRaw);
  // "이어서 하시겠어요?" 를 묻고 있는 동안인가. 이 boolean 으로 의존성을 잡아야
  // 아래 자동 보관 effect 가 렌더마다 다시 돌지 않는다(restorable 은 매 렌더 새 배열이다).
  const awaitingRestore = restorable !== null;

  const resultMap = useMemo(
    () => new Map(results.filter((r) => r.client_id).map((r) => [r.client_id as string, r])),
    [results]
  );
  const issuesByDraft = useMemo(() => {
    const map = new Map<string, DraftIssue[]>();
    for (const issue of issues) {
      map.set(issue.draftId, [...(map.get(issue.draftId) ?? []), issue]);
    }
    return map;
  }, [issues]);

  const pending = drafts.filter((d) => !d.registeredId);
  const registered = drafts.filter((d) => d.registeredId);
  const imageTotal = drafts.reduce((sum, d) => sum + d.galleryImages.length + d.detailImages.length, 0);

  /* 작성 중 내용 자동 보관 — 새로고침 한 번에 반나절 작업이 사라지던 문제.
     "이어서 하시겠어요?" 를 묻는 동안에는 쓰지 않는다. 이 effect 는 첫 렌더에도 도는데,
     그때 빈 카드 하나를 그대로 덮어쓰면 되살리려던 내용이 그 자리에서 사라진다. */
  useEffect(() => {
    if (awaitingRestore) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts));
    } catch {
      // 저장 공간이 가득 찼거나 차단된 환경 — 자동 보관은 부가 기능이라 조용히 넘어간다
    }
  }, [drafts, awaitingRestore]);

  /* 이 화면을 떠나면 되살리기 스냅샷을 버린다 — 다음에 들어올 때 최신 내용을 다시 읽게 한다.
     버리지 않으면 목록에 다녀온 뒤 옛 내용으로 되돌리자는 물음이 뜬다. */
  useEffect(() => forgetSavedSnapshot, []);

  /* 저장하지 않은 채 창을 닫으려 하면 붙잡는다 */
  useEffect(() => {
    const dirty = drafts.some((d) => !d.registeredId && (d.name.trim() || d.galleryImages.length > 0));
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [drafts]);

  /* ── 카드 조작 ─────────────────────────────────────── */

  function patchDraft(id: string, patch: Partial<ProductDraft>) {
    setDrafts((items) =>
      items.map((item) => {
        if (item.id !== id) return item;
        const next = { ...item, ...patch };
        // 상품명을 고치면 주소 제안도 따라간다 — 단, 사람이 주소를 직접 손봤으면 두 번 다시 건드리지 않는다
        if (patch.name !== undefined && !next.slugTouched) {
          const taken = new Set(items.filter((d) => d.id !== id).map((d) => d.slug).filter(Boolean));
          next.slug = dedupeSlug(proposeSlug(next.name), taken);
        }
        return next;
      })
    );
    // 결과 배지는 **그 카드 것만** 지운다. 예전에는 전부 비워서, 실패한 카드를 고치려고
    // 글자 하나만 쳐도 이미 등록에 성공한 카드들의 표시가 함께 사라졌다.
    setResults((rs) => rs.filter((r) => r.client_id !== id));
    setIssues((is) => is.filter((i) => i.draftId !== id));
  }

  function addDraft() {
    if (drafts.length >= MAX_PRODUCTS) return;
    setDrafts((items) => [...items, emptyDraft()]);
  }

  function removeDraft(id: string) {
    setDrafts((items) => (items.length <= 1 ? [emptyDraft()] : items.filter((item) => item.id !== id)));
    setResults((rs) => rs.filter((r) => r.client_id !== id));
    setIssues((is) => is.filter((i) => i.draftId !== id));
  }

  /** 카드 실물을 붙잡아 둔다 — DOM id 에 난수를 담으면 하이드레이션이 어긋나기 때문이다 */
  const cardRefs = useRef(new Map<string, HTMLElement>());

  /** 요약 목록의 안내를 눌렀을 때 — 카드를 펼치고 그리로 이동한다 */
  function focusIssue(draftId: string) {
    setDrafts((items) => items.map((d) => (d.id === draftId ? { ...d, collapsed: false } : d)));
    cardRefs.current.get(draftId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function setAllCollapsed(collapsed: boolean) {
    setDrafts((items) => items.map((item) => ({ ...item, collapsed })));
  }

  /** 등록이 끝난 카드를 화면에서만 치운다 — 상품은 이미 저장돼 있어 사라지지 않는다 */
  function clearRegistered() {
    setDrafts((items) => {
      const left = items.filter((item) => !item.registeredId);
      // 한 장도 안 남으면 빈 카드를 둔다. 카드가 0개면 아무것도 할 수 없는 화면이 된다
      return left.length > 0 ? left : [emptyDraft()];
    });
    setResults((rs) => rs.filter((r) => drafts.some((d) => d.id === r.client_id && !d.registeredId)));
  }

  /** 엑셀에서 읽은 초안으로 갈아 끼운다 — 작성 중이던 게 있으면 먼저 확인받는다 */
  function applyImport(result: SheetImportResult) {
    setDrafts(result.drafts);
    setQueued(result.queued);
    setResults([]);
    setIssues([]);
    setShowSheet(false);
    // 엑셀에 없어 기본값으로 채운 것(재고 0 등)까지 한 줄에 담는다 — 문구는 bulk-submit 소관
    setMessage({ tone: "ok", text: importMessage(result) });
  }

  /** 엑셀 확정 — 작성 중이던 게 있으면 먼저 확인받는다 */
  function handleSheetConfirm(result: SheetImportResult) {
    const hasWork = drafts.some((d) => d.name.trim() || d.galleryImages.length > 0);
    if (hasWork) setPendingImport(result);
    else applyImport(result);
  }

  function loadQueued() {
    const room = MAX_PRODUCTS - drafts.length;
    if (room <= 0 || queued.length === 0) return;
    setDrafts((items) => [...items, ...queued.slice(0, room)]);
    setQueued((items) => items.slice(room));
  }

  /** 폴더에서 올린 사진을 각 카드에 붙인다 */
  function applyFolder(applied: FolderApplyResult[], noteCount: number, failures: string[]) {
    const { next, added, dropped } = mergeFolderImages(drafts, applied, MAX_GALLERY_IMAGES);
    setDrafts(next);
    setShowFolder(false);
    setMessage({
      tone: failures.length > 0 ? "error" : "ok",
      text:
        `사진 ${added}장을 상품 ${applied.length}개에 넣었습니다.` +
        (noteCount > 0 ? ` ${noteCount}장은 알맞은 칸으로 옮겨 두었으니 카드에서 확인해 주세요.` : "") +
        (dropped > 0
          ? ` 상품 사진은 ${MAX_GALLERY_IMAGES}장까지 들어가 ${dropped}장은 담지 못했습니다. 상세페이지에 넣을 사진이면 카드에서 아래 칸에 올려 주세요.`
          : "") +
        (failures.length > 0 ? ` ${failures.length}장은 올리지 못했습니다: ${failures[0]}` : ""),
    });
  }

  /* ── 전송 ─────────────────────────────────────────── */

  async function send(mode: "validate" | "create") {
    const found = collectIssues(pending);
    setIssues(found);
    if (found.length > 0) {
      setMessage({ tone: "error", text: `확인이 필요한 항목이 ${found.length}개 있습니다.` });
      return;
    }
    if (pending.length === 0) {
      setMessage({ tone: "error", text: "등록할 상품이 없습니다." });
      return;
    }

    setBusy(true);
    setMessage(null);
    const collected: BulkResult[] = [];

    try {
      const groups = mode === "create" ? chunk(pending, CHUNK) : [pending];
      let done = 0;
      if (mode === "create") setSent({ done: 0, total: pending.length });

      for (const group of groups) {
        const data = await postBulk(mode, group.map(toApiRow));
        collected.push(...data.results);
        done += group.length;
        if (mode === "create") setSent({ done, total: pending.length });
      }

      setResults(collected);

      if (mode === "create") {
        // 성공한 카드는 잠근다 — 다시 눌러도 중복으로 들어가지 않게
        setDrafts((items) =>
          items.map((item) => {
            const hit = collected.find((r) => r.client_id === item.id);
            if (!hit || (!hit.ok && !hit.skipped)) return item;
            return {
              ...item,
              registeredId: hit.product_id ?? item.registeredId,
              collapsed: true,
            };
          })
        );
      }

      setMessage(summarizeResults(collected, mode));
    } catch (e) {
      setMessage({ tone: "error", text: e instanceof Error ? e.message : "요청을 처리하지 못했습니다." });
      if (collected.length > 0) setResults(collected);
    } finally {
      setBusy(false);
      setSent(null);
    }
  }

  /**
   * 등록 확인 대화상자를 열기 전에 **먼저 검증한다.**
   *
   * 예전에는 버튼을 누르는 즉시 "'○○' 외 29개를 등록합니다" 가 떴다. 그런데 그 뒤에 도는
   * 검증에서 절반이 걸리면 약속한 수는 처음부터 지킬 수 없는 수였다. 확인창은 사람이
   * 마지막으로 무게를 재는 자리이므로, 거기 적히는 수는 **확정값**이어야 한다.
   */
  function requestCreate() {
    const found = collectIssues(pending);
    setIssues(found);
    if (found.length > 0) {
      setMessage({
        tone: "error",
        text: `확인이 필요한 항목이 ${found.length}개 있습니다. 위 목록에서 눌러 고친 뒤 다시 등록해 주세요.`,
      });
      return;
    }
    if (pending.length === 0) {
      setMessage({ tone: "error", text: "등록할 상품이 없습니다." });
      return;
    }
    setMessage(null);
    setConfirmCreate(true);
  }

  const readyCount = pending.length;
  // 이미 있어 건너뛸 행은 '바로 등록할 수 있는 상품' 이 아니다
  const passedCount = results.filter((r) => r.ok && !r.skipped).length;

  return (
    <div>
      <BulkHeader
        readyCount={readyCount}
        registeredCount={registered.length}
        draftCount={drafts.length}
        busy={busy}
        onAddDraft={addDraft}
        onValidate={() => void send("validate")}
        onRequestCreate={requestCreate}
      />

      <BulkNotices
        restorable={restorable}
        onRestore={(items) => {
          setDrafts(items);
          setRestoreHandled(true);
        }}
        onDiscardRestore={() => setRestoreHandled(true)}
        message={message}
        sent={sent}
      />

      <IntakeSections
        categories={categories}
        drafts={drafts}
        showSheet={showSheet}
        showFolder={showFolder}
        setShowSheet={setShowSheet}
        setShowFolder={setShowFolder}
        onSheetConfirm={handleSheetConfirm}
        onFolderApply={applyFolder}
      />

      <BulkStatusPanels
        readyCount={readyCount}
        imageTotal={imageTotal}
        passedCount={passedCount}
        issues={issues}
        queuedCount={queued.length}
        draftCount={drafts.length}
        registeredCount={registered.length}
        onFocusIssue={focusIssue}
        onLoadQueued={loadQueued}
        onCollapseAll={setAllCollapsed}
        onClearRegistered={clearRegistered}
      />

      <div className="space-y-4">
        {drafts.map((draft, index) => (
          <DraftCard
            key={draft.id}
            draft={draft}
            index={index}
            categories={categories}
            result={resultMap.get(draft.id)}
            issues={issuesByDraft.get(draft.id) ?? []}
            onPatch={(patch) => patchDraft(draft.id, patch)}
            onRemove={() => removeDraft(draft.id)}
            sectionRef={(el) => {
              if (el) cardRefs.current.set(draft.id, el);
              else cardRefs.current.delete(draft.id);
            }}
          />
        ))}
      </div>

      <BulkStickyBar
        readyCount={readyCount}
        registeredCount={registered.length}
        busy={busy}
        onValidate={() => void send("validate")}
        onRequestCreate={requestCreate}
      />

      <BulkConfirmDialogs
        pending={pending}
        confirmCreate={confirmCreate}
        onCloseCreate={() => setConfirmCreate(false)}
        onConfirmCreate={() => void send("create")}
        importPending={pendingImport != null}
        onCloseImport={() => setPendingImport(null)}
        onConfirmImport={() => {
          if (pendingImport) applyImport(pendingImport);
          setPendingImport(null);
        }}
        draftCount={drafts.length}
        imageTotal={imageTotal}
      />
    </div>
  );
}
