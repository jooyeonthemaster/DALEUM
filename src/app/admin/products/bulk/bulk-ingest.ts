"use client";

/* ============================================================
   사진 받아 넣기 — 폴더 통째로 올릴 때와 카드에서 한 장씩 올릴 때가 같은 규칙을 쓴다

   여기서 해결하는 두 가지:

   1) **큰 파일이 아예 안 올라가던 문제.**
      옛 코드는 클라이언트에서 5MB 로 잘라 막았다. 그런데 제조사에게 받는 상세페이지
      원본은 `상품상세설명_1_260316.jpg` = 17.9MB / 2083×18,830px 이다. 즉 상세페이지가
      있는 상품은 단 하나도 등록할 수 없었고, 화면은 "5MB 이하로 올려 주세요" 라고만 해
      포토샵을 모르면 방법이 없었다.
      이제 lib/admin-upload 의 uploadGalleryImage / uploadDetailImage 를 쓴다 —
      긴 변 2,000px 축소, 세로로 긴 것은 폭 1,080 · 높이 4,000px 조각으로 자동 분할해
      조각마다 수백 KB 로 보내므로 원본 크기 제한이 사실상 사라진다.

   2) **상세 통이미지를 대표 칸에 잘못 넣던 사고.**
      scripts/fix_tall_gallery_images.mjs 주석에 남아 있는 실제 사고다 —
      "갤러리에 잘못 들어간 상세 통이미지(1600 × 18,700~24,800px)… 썸네일 스트립과
      확대 뷰에 세로 2만 px 짜리가 걸려 상품 사진 구실을 못 했다."
      썸네일이 aspect-square 라 육안으로는 구분되지 않으므로, 사람 눈 대신
      **업로드 직전에 가로세로를 재서** 세로로 긴 것은 상세 칸으로 옮기고 그 사실을 알린다.
   ============================================================ */

import { guessRole, readImageMeta } from "@/lib/image-pipeline";
import { isImageFile, uploadDetailImage, uploadGalleryImage } from "@/lib/admin-upload";
import type { DraftImage } from "./bulk-types";
import type { ImageLane } from "./bulk-folder";

export interface IngestProgress {
  fileName: string;
  /** 지금 몇 번째 파일인지 */
  fileIndex: number;
  fileTotal: number;
  /** 한 파일 안에서의 진행(조각 나누기·저장) */
  done: number;
  total: number;
  stage: "reading" | "slicing" | "uploading";
}

export interface IngestOutcome {
  gallery: DraftImage[];
  detail: DraftImage[];
  /** 사람에게 알릴 한국어 안내 — 자동으로 옮긴 사진 등 */
  notes: string[];
  /** 실패한 파일 — 한 장이 실패해도 나머지는 계속 올린다 */
  failures: string[];
}

/** 사람이 읽는 진행 문구 — "조각", "슬라이스" 같은 말 대신 하는 일을 그대로 적는다 */
export function progressText(p: IngestProgress): string {
  if (p.stage === "reading") return "사진을 살펴보는 중";
  if (p.stage === "slicing") return `긴 이미지를 화면에 맞게 정리하는 중 ${p.done}/${p.total}`;
  return `사진을 저장하는 중 ${p.done}/${p.total}`;
}

export interface IngestOptions {
  /**
   * 부르는 쪽이 **이미 가로세로를 재서** 칸을 정해 두었는가.
   *
   * 폴더 통째로 올리기는 확인 화면에서 치수를 재 배정을 확정하고 그 숫자를 사람에게 약속한다.
   * 그런데 상세 칸에는 세로비가 낮은 조각(gyb_02 는 780×1197)이 정상적으로 함께 온다 —
   * 그것마다 "상품 사진처럼 보입니다" 를 띄우면 한 벌짜리 상세페이지에서 안내만 열 줄 넘게
   * 쌓여, 정작 봐야 할 실패 안내가 묻힌다. 그래서 그 알림만 접는다.
   * 세로로 긴 사진을 상세로 옮기는 것은 이 값과 무관하게 **언제나** 한다(치수를 못 잰 파일의
   * 마지막 방어선이다).
   */
  laneDecided?: boolean;
}

/**
 * 파일 여러 장을 받아 대표/상세로 나눠 올린다.
 *
 * @param lane 사용자가 넣으려던 칸. 실제 가로세로와 어긋나면 상세 쪽으로만 옮긴다 —
 *             반대(상세 → 대표)로는 옮기지 않는다. 가로로 넓은 상세 배너는 정상이기 때문이다.
 */
export async function ingestFiles(
  files: File[],
  lane: ImageLane,
  prefix: string,
  onProgress?: (progress: IngestProgress | null) => void,
  options: IngestOptions = {}
): Promise<IngestOutcome> {
  const gallery: DraftImage[] = [];
  const detail: DraftImage[] = [];
  const notes: string[] = [];
  const failures: string[] = [];

  const images = files.filter(isImageFile);
  for (const rejected of files.filter((f) => !isImageFile(f))) {
    failures.push(`'${rejected.name}' 은 사진 파일이 아니라 건너뛰었습니다.`);
  }

  for (const [index, file] of images.entries()) {
    const report = (patch: Partial<IngestProgress>) =>
      onProgress?.({
        fileName: file.name,
        fileIndex: index + 1,
        fileTotal: images.length,
        done: 0,
        total: 1,
        stage: "reading",
        ...patch,
      });

    try {
      report({ stage: "reading" });
      const meta = await readImageMeta(file);
      const role = guessRole(meta);

      let target: ImageLane = lane;
      if (lane === "gallery" && role === "detail") {
        target = "detail";
        notes.push(
          `'${file.name}' 은 세로로 매우 긴 사진이라 상세페이지 칸으로 옮겼습니다. 상품 사진 자리에 두면 목록과 확대 화면이 깨집니다.`
        );
      } else if (lane === "detail" && role === "gallery" && !options.laneDecided) {
        notes.push(
          `'${file.name}' 은 상품 사진처럼 보입니다. 상세페이지 칸에 그대로 두었으니 확인해 주세요.`
        );
      }

      if (target === "detail") {
        const { slices } = await uploadDetailImage(file, {
          prefix,
          onProgress: (done, total, stage) => report({ done, total, stage }),
        });
        for (const slice of slices) {
          detail.push({
            url: slice.url,
            width: slice.width,
            height: slice.height,
            name: slice.sourceName,
          });
        }
      } else {
        report({ stage: "uploading", done: 0, total: 1 });
        const asset = await uploadGalleryImage(file, { prefix });
        gallery.push({
          url: asset.url,
          width: asset.width,
          height: asset.height,
          name: asset.sourceName,
        });
        report({ stage: "uploading", done: 1, total: 1 });
      }
    } catch (e) {
      failures.push(
        `'${file.name}' 을 올리지 못했습니다 — ${
          e instanceof Error ? e.message : "이 파일은 자동 정리에 실패했습니다. 담당자에게 원본을 다시 요청해 주세요."
        }`
      );
    }
  }

  onProgress?.(null);
  return { gallery, detail, notes, failures };
}

/** 세로로 긴 사진인지 — 썸네일 위 배지로 형태를 드러내는 데 쓴다 */
export function isTall(image: DraftImage): boolean {
  return image.width > 0 && image.height / image.width > 2.5;
}
