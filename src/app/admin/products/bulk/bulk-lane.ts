/* ============================================================
   사진이 어느 칸으로 갈지 정하는 **단 하나의** 규칙

   왜 따로 떼어 냈는가:
   전에는 같은 판정을 두 곳에서 서로 다른 근거로 했다.
   · 확인 화면 요약 = 파일명에 '상세' 가 있는지 (bulk-folder.guessLane)
   · 실제 배정     = 업로드 직전에 잰 세로비 2.5 (bulk-ingest → guessRole)
   그래서 화면이 약속한 숫자와 실제로 들어간 숫자가 달랐다. 실제 자산으로 재현하면
   `밥애쏙프로틴현미곤약밥/` 32장을 화면은 "상품 사진 32장 · 상세 0장" 이라 적는데
   업로드하면 11장이 상세로 빠진다 — 아무도 알아채지 못한 채 배정이 갈린다.

   더 나쁜 것은 **한 벌로 온 상세페이지 조각이 세로비만으로 찢어진다**는 점이다.
   gyb_01~14 는 전부 폭 780px 짜리 한 벌인데 세로비가 1.53~3.43 으로 섞여 있어,
   짧은 gyb_02·09·14 세 장만 상품 사진 칸으로 샌다. 고객 목록에 상세페이지 중간 토막이
   대표 사진으로 걸리는 것이다. 그래서 **같은 폴더·같은 가로폭·같은 이름꼴 연번 묶음은
   통째로 한 칸**으로 다룬다.

   이 파일은 파일 시스템도 화면도 모른다 — 이름과 치수만 받아 규칙만 돌려준다.
   ============================================================ */

import { GALLERY_MAX_RATIO } from "@/lib/image-pipeline";

export type ImageLane = "gallery" | "detail";

/** 규칙이 보는 것 전부. width·height 를 못 쟀으면 0 을 넣는다 */
export interface LaneInput {
  name: string;
  /** 파일이 들어 있던 폴더의 전체 상대 경로 — 이름만 쓰면 다른 폴더가 한 묶음으로 뭉개진다 */
  dir: string;
  width: number;
  height: number;
}

const DETAIL_NAME_RE = /(상세|웹상세|상품상세설명|detail)/i;
const GALLERY_NAME_RE = /(메인|main|대표|썸네일|thumb|누끼)/i;

/** 한 묶음으로 인정하는 최소 장수 — 두 장은 우연히 같을 수 있다 */
const SERIES_MIN = 3;

/**
 * 상품 사진 자리에 두면 목록·확대 화면이 깨지는 형태인가.
 * 서버(row-normalize)도 같은 값으로 마지막 방어를 하므로 여기서 어기면 저장 뒤 뒤집힌다.
 */
export function isTallSize(width: number, height: number): boolean {
  return width > 0 && height / width > GALLERY_MAX_RATIO;
}

/** 파일명만으로 알 수 있는 것 — 못 정하면 null 을 돌려 다음 근거에 넘긴다 */
export function laneByName(fileName: string): ImageLane | null {
  if (DETAIL_NAME_RE.test(fileName)) return "detail";
  if (GALLERY_NAME_RE.test(fileName)) return "gallery";
  return null;
}

/**
 * 이름에서 숫자를 걷어낸 '이름꼴'.
 * `gyb_01.jpg`·`gyb_14.jpg` → `gyb_#.jpg` 로 같아지고,
 * `thumbnail6-1.jpg` 는 `thumbnail#-#.jpg` 라 `thumbnail6.jpg` 와는 다른 꼴로 남는다.
 */
export function nameTemplate(fileName: string): string {
  return fileName.toLowerCase().replace(/\d+/g, "#");
}

/** 이름 안의 숫자들 — 연번인지 보려면 값이 서로 달라야 한다 */
function numbersIn(fileName: string): string {
  return (fileName.match(/\d+/g) ?? []).join(",");
}

/**
 * 파일 하나만 놓고 본 배정. 순서가 곧 우선순위다.
 * 세로비를 맨 앞에 두는 이유: 이름이 무엇이든 세로 2만 px 짜리가 상품 사진 칸에 들어가면
 * 썸네일 스트립이 깨진다(scripts/fix_tall_gallery_images.mjs 에 남은 실제 사고).
 */
function laneAlone(file: LaneInput): ImageLane {
  if (isTallSize(file.width, file.height)) return "detail";
  return laneByName(file.name) ?? "gallery";
}

/**
 * 여러 장을 한꺼번에 보고 배정한다 — 입력과 같은 순서로 돌려준다.
 *
 * 묶음(연번 한 벌) 판정: 같은 폴더 · 같은 가로폭 · 같은 이름꼴 · 서로 다른 번호가 3장 이상.
 * 그 묶음의 절반 이상이 홀로 봐도 상세로 갈 것이라면 **묶음 전체**를 상세로 보낸다.
 * 절반 기준을 쓰는 이유: 상품 사진 한 벌에 세로로 긴 배너 한 장이 섞였다고 해서
 * 상품 사진 전부를 상세로 끌고 가면 대표 사진이 사라진다.
 */
export function decideLanes(files: LaneInput[]): ImageLane[] {
  const lanes = files.map(laneAlone);

  const groups = new Map<string, number[]>();
  files.forEach((file, index) => {
    if (file.width <= 0) return; // 치수를 모르면 묶음 판정에 넣지 않는다
    const key = `${file.dir}\u0000${nameTemplate(file.name)}\u0000${file.width}`;
    groups.set(key, [...(groups.get(key) ?? []), index]);
  });

  for (const members of groups.values()) {
    if (members.length < SERIES_MIN) continue;
    const distinct = new Set(members.map((i) => numbersIn(files[i].name)));
    if (distinct.size < members.length) continue; // 번호가 겹치면 연번 한 벌이라 보기 어렵다
    const detailCount = members.filter((i) => lanes[i] === "detail").length;
    if (detailCount * 2 < members.length) continue;
    for (const i of members) lanes[i] = "detail";
  }

  return lanes;
}

/**
 * 사람이 폴더 단위로 고른 값까지 얹은 최종 배정.
 * 확인 화면의 숫자와 실제 업로드가 **이 함수 하나**를 같이 본다 — 두 벌로 두면 또 갈린다.
 */
export function resolveLane(
  file: Pick<LaneInput, "width" | "height">,
  decided: ImageLane,
  forced: ImageLane | "auto"
): ImageLane {
  // 사람이 '모두 상품 사진' 을 골라도 이것만은 못 넘긴다. 넘겨 봐야 서버가 되돌린다.
  if (isTallSize(file.width, file.height)) return "detail";
  if (forced !== "auto") return forced;
  return decided;
}
