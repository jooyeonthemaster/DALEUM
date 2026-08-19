/* ============================================================
   이미지 폴더 통째로 받기 — 폴더명↔상품, 파일↔용도 자동 배정

   왜 필요한가:
   화면에는 "이미지는 드라이브처럼 끌어넣어 등록합니다" 라고 적혀 있었지만,
   실제 코드는 `event.dataTransfer.files` 만 읽어 **폴더 드래그가 동작하지 않았다.**
   폴더를 끌어놓으면 type 이 빈 File 하나가 들어와 "이미지 파일만 업로드할 수 있습니다"
   라는, 원인을 알 수 없는 거절만 돌아왔다.

   실제 자산 `수다락 상세페이지/` 는 193개 파일이 상품별 폴더로 이미 정리돼 있다.
     화심영농조합법인_바로먹는곤약면 상세페이지_052626/
       우동인데 곤약/
         우동인데 곤약 메인이미지_1_260419.png      ← 대표
         우동인데 곤약 메인이미지 누끼컷_1_260323(1000).png
         상품상세설명_1_260316.jpg                  ← 상세 (18MB · 2083×18830)
   그래서 (1) 폴더를 재귀로 훑고 (2) **바로 위 폴더명**을 상품명으로 보고 짝짓고
   (3) 파일 이름과 **실제 가로세로**로 대표/상세를 나눈다. 전부 **추천**이며 화면에서 사람이 바꾼다.

   ── 두 가지를 고쳤다 ──
   1) 용도 판정을 이름 규칙 하나로 하지 않는다. 확인 화면에 적히는 숫자와 실제로 올라가는
      칸이 달랐기 때문이다(자세한 사정은 bulk-lane.ts 머리말). 이제 훑는 단계에서
      머리글만 읽어 치수를 재고, 배정은 bulk-lane 의 규칙 하나로만 정한다.
   2) 묶음 키를 **폴더 이름**이 아니라 **전체 경로**로 잡는다. 바로 위 폴더명만 쓰면
      `수다락 상세페이지/밥애쏙프로틴현미곤약밥` 과
      `수다락 상세페이지/화심영농조합법인_…/밥애쏙프로틴현미곤약밥` 이 한 묶음으로 뭉개진다.
      이 저장소에서는 두 폴더 내용이 같아 손해가 없었지만, 브랜드마다 '메인'·'상세' 폴더를
      두는 흔한 구조에서는 남의 상품 사진이 리사이즈 사본으로 몰려 조용히 지워진다.

   판단은 여기서 하지 않는다 — 이 파일은 순수 함수만 두어 규칙을 따로 검증할 수 있게 한다.
   ============================================================ */

import type { ProductDraft } from "./bulk-types";
import { decideLanes, type ImageLane, type LaneInput } from "./bulk-lane";
import { readPixelSize } from "./bulk-image-size";

export type { ImageLane } from "./bulk-lane";

export interface PickedFile {
  file: File;
  /** 사람에게 보여 줄 이름 — 파일이 들어 있던 바로 위 폴더명 (최상위면 빈 문자열) */
  folder: string;
  /** 묶음 키로 쓰는 폴더의 전체 상대 경로. 이름만으로는 서로 다른 폴더가 뭉개진다 */
  dir: string;
  /** 사람에게 보여 줄 전체 경로 */
  path: string;
}

export interface AssignedFile extends PickedFile {
  /** 배정된 상품 초안 id — 짝을 못 찾으면 null */
  draftId: string | null;
  lane: ImageLane;
  /** 훑을 때 잰 실제 픽셀 치수. 못 쟀으면 0 — 그때는 업로드 직전 판정에 맡긴다 */
  width: number;
  height: number;
}

const IMAGE_EXT_RE = /\.(jpe?g|png|webp|gif|avif)$/i;

/** 이미지인가 — 폴더 순회로 만든 File 은 type 이 비어 있을 때가 있어 확장자도 함께 본다 */
export function looksLikeImage(file: File): boolean {
  return file.type.startsWith("image/") || IMAGE_EXT_RE.test(file.name);
}

/* ── 폴더 순회 ─────────────────────────────────────────── */

function readAllEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  // readEntries 는 한 번에 최대 100개만 준다 — 빈 배열이 올 때까지 반복해야 한다.
  // 이걸 빠뜨리면 파일이 100개가 넘는 폴더에서 뒷부분이 조용히 사라진다.
  return new Promise((resolve) => {
    const all: FileSystemEntry[] = [];
    const step = () => {
      reader.readEntries(
        (batch) => {
          if (batch.length === 0) {
            resolve(all);
            return;
          }
          all.push(...batch);
          step();
        },
        () => resolve(all)
      );
    };
    step();
  });
}

function entryToFile(entry: FileSystemFileEntry): Promise<File | null> {
  return new Promise((resolve) => {
    entry.file(
      (file) => resolve(file),
      () => resolve(null)
    );
  });
}

async function walkEntry(entry: FileSystemEntry, trail: string[], out: PickedFile[]): Promise<void> {
  if (entry.isFile) {
    const file = await entryToFile(entry as FileSystemFileEntry);
    if (!file || !looksLikeImage(file)) return;
    out.push({
      file,
      folder: trail[trail.length - 1] ?? "",
      dir: trail.join("/"),
      path: [...trail, file.name].join("/"),
    });
    return;
  }
  if (!entry.isDirectory) return;

  const dir = entry as FileSystemDirectoryEntry;
  const children = await readAllEntries(dir.createReader());
  for (const child of children) {
    await walkEntry(child, [...trail, dir.name], out);
  }
}

/** 끌어놓기에서 폴더째 받기 — DataTransferItem 을 디렉터리로 펼친다 */
export async function collectFromDrop(dataTransfer: DataTransfer): Promise<PickedFile[]> {
  const items = Array.from(dataTransfer.items);
  const entries = items
    .map((item) => (typeof item.webkitGetAsEntry === "function" ? item.webkitGetAsEntry() : null))
    .filter((entry): entry is FileSystemEntry => entry != null);

  // 디렉터리 API 를 못 쓰는 브라우저는 평평한 파일 목록으로 물러난다
  if (entries.length === 0) {
    return Array.from(dataTransfer.files)
      .filter(looksLikeImage)
      .map((file) => ({ file, folder: "", dir: "", path: file.name }));
  }

  const out: PickedFile[] = [];
  for (const entry of entries) {
    await walkEntry(entry, [], out);
  }
  return out;
}

/** 폴더 선택 input(webkitdirectory)에서 받기 — 경로는 webkitRelativePath 에 들어 있다 */
export function collectFromInput(files: FileList | File[]): PickedFile[] {
  return Array.from(files)
    .filter(looksLikeImage)
    .map((file) => {
      const relative = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
      const parts = relative.split("/");
      return {
        file,
        folder: parts.length > 1 ? parts[parts.length - 2] : "",
        dir: parts.slice(0, -1).join("/"),
        path: relative,
      };
    });
}

/* ── 사본 걸러 내기 · 정렬 ─────────────────────────────── */

/** 파일명 안의 숫자를 살려 정렬한다 — _2 가 _10 보다 앞에 오도록 */
export function naturalCompare(a: string, b: string): number {
  const split = (s: string) => s.toLowerCase().match(/(\d+|\D+)/g) ?? [];
  const aa = split(a);
  const bb = split(b);
  for (let i = 0; i < Math.max(aa.length, bb.length); i += 1) {
    const x = aa[i];
    const y = bb[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    const nx = Number(x);
    const ny = Number(y);
    if (!Number.isNaN(nx) && !Number.isNaN(ny)) {
      if (nx !== ny) return nx - ny;
    } else if (x !== y) {
      return x < y ? -1 : 1;
    }
  }
  return 0;
}

/** 리사이즈 사본을 걸러 낸 결과 — 몇 장을 뺐는지 화면에 알려야 한다 */
export interface DedupeResult {
  kept: PickedFile[];
  /** 같은 사진의 작은 사본이라 보고 뺀 장수 */
  dropped: number;
}

/**
 * 리사이즈 사본 걸러 내기.
 *
 * 실제 자산에는 같은 사진이 크기만 다르게 여러 벌 있다.
 *   밥애쏙 이미지(600)_260317_배경삭제.png
 *   밥애쏙 이미지(1000)_260317_배경삭제.png
 *   밥애쏙 이미지(3780)_260317_배경삭제.png
 * 전부 올리면 고객 상세페이지에 같은 사진이 세 번 걸린다.
 *
 * 옛 정규식은 괄호 숫자가 **확장자 바로 앞**에 있을 때만 잡았다(`…(1000).png`).
 * 그런데 실제 파일은 그 뒤에 `_260317_배경삭제` 가 더 붙어 하나도 걸리지 않았고,
 * 같은 누끼컷 4장이 전부 살아남았다. 그래서 괄호 숫자를 **이름 어디서든** 찾아 지운
 * 값으로 묶는다. 어차피 업로드 파이프라인이 긴 변 2,000px 으로 줄이므로 **가장 큰 것**을
 * 남기고, 괄호 표식이 없는 원본이 있으면 그것이 이긴다.
 */
export function dropResizedCopies(files: PickedFile[]): DedupeResult {
  const groups = new Map<string, { picked: PickedFile; size: number }>();

  for (const item of files) {
    const match = item.file.name.match(/[（(](\d{3,4})[）)]/);
    // 묶음 키는 **폴더 전체 경로**다. 폴더 이름만 쓰면 다른 상품 폴더끼리 뭉개진다.
    if (!match) {
      const key = `${item.dir} ${item.file.name.toLowerCase()}`;
      groups.set(key, { picked: item, size: Number.POSITIVE_INFINITY });
      continue;
    }
    const bare = item.file.name.replace(match[0], "").toLowerCase();
    const key = `${item.dir} ${bare}`;
    const size = Number(match[1]);
    const prev = groups.get(key);
    if (!prev || size > prev.size) groups.set(key, { picked: item, size });
  }

  const kept = [...groups.values()]
    .map(({ picked }) => picked)
    .sort((a, b) => naturalCompare(a.path, b.path));
  return { kept, dropped: files.length - kept.length };
}

/* ── 상품 짝짓기 ───────────────────────────────────────── */

/** 비교용으로 이름을 다듬는다 — 띄어쓰기·부호 차이로 짝을 놓치지 않게 */
function comparable(value: string): string {
  return value.replace(/[\s_\-().]/g, "").toLowerCase();
}

/**
 * 폴더명 ↔ 상품명 짝짓기.
 * 한쪽이 다른 쪽을 포함하면 짝으로 보고, 여럿이면 겹치는 글자가 가장 긴 쪽을 고른다
 * ("여주발효곤약밥" 과 "맛있는여주발효곤약밥" 이 함께 있을 때 잘못 붙지 않게).
 *
 * ⚠ 이름이 완전히 같으면 **거기서 끝낸다.** 이 한 줄이 없으면 카드 순서에 따라 짝이 바뀐다:
 * 실제 자산에 '여주발효곤약밥' 과 '맛있는여주발효곤약밥' 폴더가 둘 다 있는데,
 * '여주발효곤약밥'(7자) 은 두 상품 모두에 포함 관계가 성립해 겹치는 길이가 7로 같다.
 * 옛 코드는 동점일 때 먼저 만난 쪽을 골라서, 엑셀에 '맛있는…' 이 먼저 오면
 * '여주발효곤약밥' 폴더의 사진이 통째로 '맛있는여주발효곤약밥' 에 붙었다.
 * 사진이 남의 상품에 들어가도 화면에는 정상으로 보이므로 사람이 알아채기 어렵다.
 *
 * 동점이면서 완전일치도 없을 때는 **글자 수 차이가 작은 쪽**을 고른다 —
 * 폴더명에 가까운 이름일수록 실제로 그 상품일 가능성이 높다.
 */
export function matchDraft(folder: string, drafts: ProductDraft[]): string | null {
  const key = comparable(folder);
  if (!key) return null;

  let best: { id: string; score: number; gap: number } | null = null;
  for (const draft of drafts) {
    const name = comparable(draft.name);
    if (!name) continue;
    if (name === key) return draft.id;
    if (!key.includes(name) && !name.includes(key)) continue;
    const score = Math.min(name.length, key.length);
    const gap = Math.abs(name.length - key.length);
    if (!best || score > best.score || (score === best.score && gap < best.gap)) {
      best = { id: draft.id, score, gap };
    }
  }
  return best ? best.id : null;
}

/* ── 배정 ──────────────────────────────────────────────── */

export interface AssignmentPlan {
  files: AssignedFile[];
  /** 리사이즈 사본이라 보고 뺀 장수 — 말없이 버리면 사진이 사라진 것으로 보인다 */
  dropped: number;
  /** 치수를 읽지 못한 장수. 이것들은 업로드 직전 판정에 맡긴다 */
  unmeasured: number;
}

/**
 * 모아 온 파일 전체를 상품·용도로 배정한다.
 *
 * 치수를 여기서 재는 이유: 확인 화면이 약속하는 숫자와 실제 배정이 같아야 하는데,
 * 그 판정에 가로세로가 필요하기 때문이다. 머리글만 읽으므로 193장도 순식간에 끝난다.
 */
export async function planAssignment(
  files: PickedFile[],
  drafts: ProductDraft[],
  onProgress?: (done: number, total: number) => void
): Promise<AssignmentPlan> {
  const { kept, dropped } = dropResizedCopies(files);

  const sizes: ({ width: number; height: number } | null)[] = [];
  for (const [index, item] of kept.entries()) {
    sizes.push(await readPixelSize(item.file));
    onProgress?.(index + 1, kept.length);
  }

  const laneInputs: LaneInput[] = kept.map((item, i) => ({
    name: item.file.name,
    dir: item.dir,
    width: sizes[i]?.width ?? 0,
    height: sizes[i]?.height ?? 0,
  }));
  const lanes = decideLanes(laneInputs);

  const folderCache = new Map<string, string | null>();
  const assigned = kept.map((item, i) => {
    if (!folderCache.has(item.dir)) {
      folderCache.set(item.dir, matchDraft(item.folder, drafts));
    }
    return {
      ...item,
      draftId: folderCache.get(item.dir) ?? null,
      lane: lanes[i],
      width: laneInputs[i].width,
      height: laneInputs[i].height,
    };
  });

  return { files: assigned, dropped, unmeasured: sizes.filter((s) => s == null).length };
}

export interface FolderSummary {
  /** 묶음 키 — 폴더의 전체 경로 */
  dir: string;
  /** 화면에 보여 줄 폴더 이름 */
  folder: string;
  draftId: string | null;
  galleryCount: number;
  detailCount: number;
  total: number;
}

/**
 * 폴더 단위 요약 — "우동인데 곤약 ← 폴더 '우동인데 곤약' : 대표 6장 · 상세 2장"
 *
 * ⚠ 반드시 **최종 배정이 끝난 목록**을 넘겨라. 여기서 다시 세지 않고 받은 대로 셈으로써
 * 화면에 적히는 숫자가 실제 업로드와 어긋날 수 없게 한다.
 */
export function summarizeByFolder(assigned: AssignedFile[]): FolderSummary[] {
  const map = new Map<string, FolderSummary>();
  for (const item of assigned) {
    const existing = map.get(item.dir) ?? {
      dir: item.dir,
      folder: item.folder,
      draftId: item.draftId,
      galleryCount: 0,
      detailCount: 0,
      total: 0,
    };
    if (item.lane === "detail") existing.detailCount += 1;
    else existing.galleryCount += 1;
    existing.total += 1;
    existing.draftId = item.draftId;
    map.set(item.dir, existing);
  }
  return [...map.values()].sort((a, b) => naturalCompare(a.dir, b.dir));
}
