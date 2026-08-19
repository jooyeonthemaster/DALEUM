"use client";

/* ============================================================
   편집기 사진 반입 — 파일이 들어오는 모든 길목을 하나로 모은다

   편집 캔버스에 사진이 들어오는 길은 여럿이다: 캔버스에 끌어다 놓기,
   툴바의 「사진 넣기」, 슬래시 메뉴, 다른 탭에서 넘겨받은 반입.
   길마다 올리기 코드를 따로 두면 어느 하나만 조각내기를 빠뜨리는 날이 오고,
   그날 관리자는 970×17,558px 통이미지를 통째로 올리다 서버에 막힌다.
   그래서 "파일 → 올라간 결과" 는 여기 한 곳에만 둔다.

   ── 이 훅은 DOM 도 TipTap 도 모른다 ──
   돌려주는 것은 삽입에 필요한 값(DetailImageInsert)뿐이고,
   그걸 문서 어디에 꽂을지는 부르는 쪽이 정한다. 이유는 두 가지다.
     1) 커서 위치·선택 영역은 부르는 쪽만 안다. 훅이 알려 들면 편집기 내부를 껴안게 된다.
     2) 이렇게 두면 캔버스가 없는 자리(예: 다른 탭에서 넘어온 반입)에서도 같은 규칙으로 쓴다.
   삽입은 부르는 쪽, 올리기는 여기 — 이 선을 넘지 않는다.

   판정 규칙은 components/admin/detail/DetailPageEditor.tsx 의 반입과 같다.
   세로로 아주 긴 사진(guessRole === "detail")은 조각내어 여러 장으로,
   그 외에는 한 장으로 올린다. 전처리를 하는 까닭은 lib/image-pipeline.ts 머리말 참고.

   ── 두 걸음으로 나눠 일한다: 헤아리기(plan) → 올리기 ──
   먼저 파일 전부의 치수를 읽어 "조각이 몇 장 나오는가" 를 확정한 뒤에 올리기 시작한다.
   한 장씩 읽으면서 곧바로 올리면 진행률의 분모가 도중에 커져 눈금이 뒤로 가는 것처럼 보인다.
   치수 읽기는 어차피 판정(guessRole) 때문에 파일마다 한 번은 해야 하므로,
   순서를 앞으로 당긴 것일 뿐 디코딩 횟수가 늘지는 않는다.
   ============================================================ */

import { useCallback, useEffect, useRef, useState } from "react";
import { isImageFile, uploadDetailImage, uploadGalleryImage } from "@/lib/admin-upload";
import type { Align } from "@/lib/detail-doc-v2";
import {
  DETAIL_SLICE_HEIGHT,
  DETAIL_TARGET_WIDTH,
  guessRole,
  readImageMeta,
  type ImageMeta,
} from "@/lib/image-pipeline";

/**
 * 편집기에 꽂을 사진 한 장 — 통이미지를 조각냈다면 조각마다 하나씩 나온다.
 *
 * 이름이 tiptap-bridge 의 detailImage 속성(src/alt/width/height/widthPct/align)과 같은 것은 의도다.
 * **문서 모델(lib/detail-doc-v2.ts 의 ImageNode)이 요구하는 값을 여기서 전부 채워 돌려준다** —
 * 부르는 쪽이 빠진 값을 지어내지 않게 하려는 것이다.
 *
 * widthPct·align 이 "있으면 좋은 것" 이 아닌 이유:
 * 고객 렌더러의 isSeamless(DetailDocRenderer.tsx)는 `widthPct === 100 && align === "center"` 인
 * 이미지가 연달아 올 때만 한 덩어리로 묶어 그린다. 둘 중 하나라도 비면 tiptap-bridge 의
 * attrAlign 이 "left" 로 굳어, 조각마다 FLOW.imageFrame 테두리와 간격이 끼어들고
 * 통이미지가 4,000px 마다 선으로 잘려 보인다. 계약이 비어 있으면 다음 호출자가 반드시 틀린다.
 */
export interface DetailImageInsert {
  src: string;
  alt: string;
  /** 올라간 파일의 실제 픽셀 — 종횡비 고정과 자리 예약의 기준값 */
  width: number;
  height: number;
  /** 콘텐츠 칼럼 대비 폭(%) — SPEC §5.1. 절대 px 을 쓰면 모바일에서 넘친다 */
  widthPct: number;
  align: Align;
  /**
   * 원본 파일 한 장에서 나온 항목끼리 같은 값을 갖는다.
   * "연달아 오는 이 N개는 원래 한 장이었다" 를 부르는 쪽이 알 수 있게 하는 표식이다.
   * 이것이 없으면 반환값만 보고는 통이미지 조각인지 상품컷 여러 장인지 가릴 수 없어,
   * 부르는 쪽이 둘을 다르게 다루고 싶어도 다룰 수가 없다.
   */
  seamGroup: string;
}

/**
 * 새로 꽂는 사진의 기본 폭·정렬.
 * 통이미지 조각은 반드시 100/center 여야 이어 붙고(위 주석), 상품컷 한 장도 같은 값으로 넣는다 —
 * 기본값이 갈리면 "왜 이 사진만 다르지" 를 관리자가 떠안는다. 폭·정렬 바꾸기는 삽입 뒤 드래그로 한다.
 */
const INSERT_WIDTH_PCT = 100;
const INSERT_ALIGN: Align = "center";

/** 지금 무엇을 하는 중인가 — 통이미지는 조각내기가 올리기보다 오래 걸려 단계를 나눠 알린다 */
export interface DetailUploadProgress {
  /** 지금 다루고 있는 파일 이름 */
  fileName: string;
  /** 서버에 올라간 조각 수 — **반입 전체 기준**이며 절대 뒤로 가지 않는다 */
  done: number;
  /** 올려야 할 조각 수 — **반입 전체 기준**이며 첫 조각을 올리기 전에 확정된다 */
  total: number;
  stage: "slicing" | "uploading";
  /** 반입 전체에서 몇 번째 파일을 다루는 중인가 (1부터) */
  fileIndex: number;
  /** 반입 전체의 파일 수 */
  fileCount: number;
}

export interface UseImageUploadOptions {
  /** 업로드 경로 접두어 — 상품 id 또는 임시 초안 id */
  uploadPrefix: string;
}

export interface UseImageUploadResult {
  /** 파일을 받아 전부 올리고, 편집기에 꽂을 항목을 순서대로 돌려준다 */
  ingest: (files: File[]) => Promise<DetailImageInsert[]>;
  progress: DetailUploadProgress | null;
  errors: string[];
  clearErrors: () => void;
}

/** 진행 셈 — 겹쳐 들어온 반입까지 한 줄에 합쳐 센다 */
interface BatchTally {
  pieceDone: number;
  pieceTotal: number;
  fileDone: number;
  fileTotal: number;
}

const EMPTY_TALLY: BatchTally = { pieceDone: 0, pieceTotal: 0, fileDone: 0, fileTotal: 0 };

/** 치수를 읽어 둔 파일 하나 — 올리기 전에 무엇을 몇 조각 올릴지까지 정해 둔다 */
interface PlannedFile {
  file: File;
  meta: ImageMeta;
  /** 세로로 아주 긴 통이미지라 조각내어 올릴 것인가 */
  sliced: boolean;
  /** 이 파일에서 나올 조각 수 — 진행 표시의 분모에 미리 더한다 */
  pieces: number;
}

/**
 * 조각이 몇 장 나올지 미리 셈한다 — 디코딩은 한 번도 더 하지 않는다.
 *
 * 전에는 조각 수를 모르는 채 "0/1" 로 띄운 뒤 조각내기가 시작되면 "1/5" 로 튀었다.
 * 관리자 눈에는 진행률이 뒤로 가는 것으로 보인다. 치수만 알면 조각 수는 확정이므로,
 * image-pipeline.ts 의 sliceTallImage 와 **같은 셈**을 여기서 먼저 해 분모를 처음부터 못 박는다.
 * (셈이 두 곳에 있는 것이 마음에 걸리지만, 조각내기가 실제 값을 알려 주는 즉시
 *  아래 반입 고리가 분모를 갈아 끼우므로 어긋나도 표시가 틀어진 채로 남지는 않는다.)
 */
function predictSliceCount(meta: ImageMeta): number {
  const scale = Math.min(1, DETAIL_TARGET_WIDTH / meta.width);
  const sourceSliceHeight = Math.max(1, Math.round(DETAIL_SLICE_HEIGHT / scale));
  return Math.max(1, Math.ceil(meta.height / sourceSliceHeight));
}

/** 실패가 어느 걸음에서 났는가 — 관리자에게 줄 문구가 갈린다 */
type FailStage = "processing" | "sending";

let seamSequence = 0;
/** 한 파일에서 나온 조각들을 묶는 표식 */
function nextSeamGroup(): string {
  seamSequence += 1;
  return `seam-${Date.now().toString(36)}-${seamSequence}`;
}

/**
 * 브라우저가 던지는 문구는 영어다(아이폰 HEIC 를 열지 못할 때 등).
 * 관리자 화면에 영문 오류가 그대로 나가면 무엇을 해야 하는지 알 수 없어서 우리 문장으로 바꾼다.
 *
 * **걸음을 가리는 이유**: 전에는 한글이 없는 오류를 전부 "형식을 바꿔서 올려 주세요" 로 바꿨다.
 * 그런데 이 길목에 오는 것은 디코딩 실패만이 아니다. 전송 실패(끊긴 인터넷, 프록시)도 온다.
 * 그때 관리자는 사진 열 장을 JPG 로 바꿔 다시 올리고도 똑같이 실패하는, 시간만 버리는 안내를 받았다.
 *
 * (uploader/useGalleryUpload.ts 에도 같은 취지의 함수가 있다. 그쪽은 내보내지 않는 지역 함수라
 *  가져다 쓸 수 없어 문구만 이 화면에 맞게 다시 적는다.)
 */
function humanReason(error: unknown, stage: FailStage): string {
  const raw = error instanceof Error ? error.message.trim() : "";

  /* 화면 문구에는 관리자가 할 일만 담는다. 원인 문자열은 여기 남겨 두어야
     나중에 "그때 무엇이 실패했지" 를 확인할 수 있다.
     error 가 아니라 warn 인 것은 반입이 여기서 멈추지 않기 때문이다 — 나머지는 계속 올라간다. */
  console.warn("[detail-editor] 사진 반입 실패", { stage, message: raw, error });

  // 서버가 한국어로 돌려준 사유(admin-upload.ts 의 postBlob)는 그대로가 가장 정확하다
  if (/[가-힣]/.test(raw)) return raw;

  /* fetch 는 연결 자체가 끊기면 반드시 TypeError 를 던진다 — 문구는 브라우저마다 다르다
     ("Failed to fetch" / "NetworkError…" / "Load failed"). 디코딩 실패는 DOMException 이라
     이 갈래로 오지 않으므로, 이 하나로 전송 실패를 가려낼 수 있다. */
  if (stage === "sending" || error instanceof TypeError) {
    return "사진을 서버로 보내지 못했습니다. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.";
  }
  return "브라우저가 이 사진을 열지 못했습니다. JPG·PNG·WebP 로 바꿔서 올려 주세요.";
}

export function useImageUpload({ uploadPrefix }: UseImageUploadOptions): UseImageUploadResult {
  const [progress, setProgress] = useState<DetailUploadProgress | null>(null);
  const [errors, setErrors] = useState<string[]>([]);

  /* 통이미지 한 장을 조각내 올리는 데 2초 안팎이 걸린다. 그 사이에 관리자가 탭을 옮기거나
     저장하고 나가면 화면은 이미 없는데 응답이 뒤늦게 돌아온다. 그때 상태를 건드리면
     사라진 컴포넌트에 쓰는 셈이 되므로, 살아 있을 때만 쓴다. */
  const alive = useRef(true);
  /* 올리는 도중에 사진을 또 떨어뜨리는 일은 흔하다. 반입이 겹칠 때
     늦게 시작한 쪽이 먼저 시작한 쪽의 오류 목록·진행 표시를 지워 버리면 안 되므로
     동시에 몇 개가 도는지 세어 둔다. */
  const running = useRef(0);
  /* 진행 셈을 반입마다 따로 두면, 겹쳐 들어온 두 번째 반입이 첫 번째의 눈금을 자기 것으로
     덮어써 진행률이 뒤로 간다. 그래서 도는 반입 전부를 한 줄에 합쳐 센다. */
  const tally = useRef<BatchTally>({ ...EMPTY_TALLY });

  useEffect(() => {
    // 개발 모드의 이중 마운트에서 false 로 굳지 않게 들어올 때마다 되살린다
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const publish = useCallback((fileName: string, stage: DetailUploadProgress["stage"]) => {
    if (!alive.current) return;
    const t = tally.current;
    setProgress({
      fileName,
      done: t.pieceDone,
      total: t.pieceTotal,
      stage,
      // 지금 다루는 것은 "끝난 파일 수 + 1" 번째다. 마지막을 끝낸 순간만 총수와 같아진다.
      fileIndex: Math.min(t.fileDone + 1, t.fileTotal),
      fileCount: t.fileTotal,
    });
  }, []);

  const ingest = useCallback(
    async (files: File[]): Promise<DetailImageInsert[]> => {
      const photos = files.filter(isImageFile);

      // 사진이 아닌 파일은 반입 전체를 세우지 않고 사유만 남긴다 —
      // 폴더째 끌어다 놓으면 .DS_Store 같은 것이 늘 섞여 들어오기 때문이다.
      const failures: string[] = files
        .filter((file) => !isImageFile(file))
        .map((file) => `'${file.name}' 은 사진 파일이 아니라 건너뛰었습니다.`);

      running.current += 1;
      if (running.current === 1 && alive.current) setErrors([]);

      const inserts: DetailImageInsert[] = [];
      try {
        /* ── 1걸음: 헤아리기 ──
           치수를 읽어 조각 수까지 확정한다. 여기서 읽어 둔 meta 는 올릴 때 그대로 넘겨
           uploadDetailImage 가 원본을 다시 풀지 않게 한다(admin-upload.ts 의 meta 인자).
           2083×18,830 짜리는 한 번 푸는 데 RGBA 약 157MB·수백 ms 라 두 번 푸는 것은 그냥 낭비다. */
        const plan: PlannedFile[] = [];
        for (const file of photos) {
          if (!alive.current) break;
          try {
            const meta = await readImageMeta(file);
            const sliced = guessRole(meta) === "detail";
            plan.push({ file, meta, sliced, pieces: sliced ? predictSliceCount(meta) : 1 });
          } catch (error) {
            const why = humanReason(error, "processing");
            failures.push(`'${file.name}' 을 올리지 못했습니다 — ${why}`);
          }
        }

        // 분모를 먼저 키워 둔다 — 첫 조각이 올라가기 전에 "몇 장 중 몇 장" 이 확정된다
        tally.current.pieceTotal += plan.reduce((sum, item) => sum + item.pieces, 0);
        tally.current.fileTotal += plan.length;

        /* ── 2걸음: 올리기 ──
           한 장씩 차례로 올린다. 동시에 보내면 조각이 수십 개인 통이미지에서
           업로드 요청이 한꺼번에 터져 나가 서버가 먼저 끊는다. */
        for (const item of plan) {
          // 화면이 사라진 뒤까지 남은 파일을 계속 올릴 이유가 없다
          if (!alive.current) break;

          const seamGroup = nextSeamGroup();
          // 실패했을 때 어느 걸음이었는지로 문구가 갈린다. 전송이 시작되면 아래에서 바뀐다.
          let failStage: FailStage = "processing";
          // 이 파일에서 지금까지 올라간 조각 수 — 전체 눈금에 더할 증분을 내는 데 쓴다
          let sent = 0;
          // 예측한 조각 수. 조각내기가 실제 값을 알려 주면 그때 바로잡는다.
          let expected = item.pieces;

          try {
            if (item.sliced) {
              /* 세로로 아주 긴 상세 통이미지 — 조각내어 올리고 조각마다 한 장씩 꽂는다.
                 아래 widthPct/align 이 100/center 이므로 고객 렌더러가 한 덩어리로 묶어 그린다.
                 (이 두 값이 빠지면 조각 경계마다 선이 생긴다 — DetailImageInsert 주석 참고) */
              publish(item.file.name, "slicing");
              const { slices } = await uploadDetailImage(item.file, {
                prefix: uploadPrefix,
                meta: item.meta,
                onProgress: (done, total, stage) => {
                  if (stage === "slicing") {
                    // 예측이 어긋났으면 분모를 실제 값으로 갈아 끼운다
                    tally.current.pieceTotal += total - expected;
                    expected = total;
                  } else {
                    failStage = "sending";
                    tally.current.pieceDone += done - sent;
                    sent = done;
                  }
                  publish(item.file.name, stage);
                },
              });

              // 조각이 예측과 달랐거나 마지막 알림을 놓쳤을 때를 위한 마무리 셈
              tally.current.pieceTotal += slices.length - expected;
              tally.current.pieceDone += slices.length - sent;

              for (const slice of slices) {
                inserts.push({
                  src: slice.url,
                  alt: "",
                  width: slice.width,
                  height: slice.height,
                  widthPct: INSERT_WIDTH_PCT,
                  align: INSERT_ALIGN,
                  seamGroup,
                });
              }
            } else {
              // 상품컷 비율 — 한 장 그대로. 조각내기 단계가 없으니 바로 올리기다.
              publish(item.file.name, "uploading");
              const asset = await uploadGalleryImage(item.file, { prefix: uploadPrefix });
              tally.current.pieceDone += 1;
              inserts.push({
                src: asset.url,
                alt: "",
                width: asset.width,
                height: asset.height,
                widthPct: INSERT_WIDTH_PCT,
                align: INSERT_ALIGN,
                seamGroup,
              });
            }
          } catch (error) {
            /* 한 장이 어그러져도 나머지는 계속 올린다 — 열 장 중 아홉 장이라도 건지는 편이 낫다.
               못 올린 몫은 분모에서 빼야 눈금이 끝까지 차오르고 "3/5 에서 멈췄네" 로 끝나지 않는다. */
            tally.current.pieceTotal -= expected - sent;
            const why = humanReason(error, failStage);
            failures.push(`'${item.file.name}' 을 올리지 못했습니다 — ${why}`);
          }

          tally.current.fileDone += 1;
        }
      } finally {
        running.current -= 1;
        // 도는 반입이 하나도 없을 때만 셈을 비운다 — 겹친 반입의 눈금을 뺏지 않으려고
        if (running.current === 0) tally.current = { ...EMPTY_TALLY };
        if (alive.current) {
          // 아직 도는 반입이 있으면 진행 표시를 뺏지 않는다
          if (running.current === 0) setProgress(null);
          if (failures.length > 0) setErrors((prev) => [...prev, ...failures]);
        }
      }

      /* alt 를 비워 두는 것은 의도다. 사진 설명은 "{상품명} 상세 이미지 {n}" 이라
         상품명과 문서 전체의 순서를 알아야 정할 수 있고, 그 둘은 부르는 쪽만 안다.
         꽂은 뒤 detail-doc-v2 의 renumberImages 로 한꺼번에 다시 매긴다. */
      return inserts;
    },
    [publish, uploadPrefix]
  );

  const clearErrors = useCallback(() => setErrors([]), []);

  return { ingest, progress, errors, clearErrors };
}
