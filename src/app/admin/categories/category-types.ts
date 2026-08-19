/* ============================================================
   카테고리 화면 공용 — 타입과, 화면에 나가는 안내문 한 벌.

   안내문을 한 곳에 모은 이유: 같은 사실(홈은 8개까지만 보여 준다, 1번이 큰 사진이 된다)을
   목록·모달·확인창 세 군데서 각자 다르게 적어 두면 곧 서로 어긋난다.
   ============================================================ */

export interface CategoryRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  image_url: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  /** 임시저장·숨김까지 포함한 전체 상품 수 */
  product_count: number;
  /** 고객에게 보이는 상품 수 (판매중·품절) */
  visible_count: number;
}

/**
 * 홈 화면 쇼케이스가 실제로 그리는 타일 수.
 * components/home/CategoryShowcase.tsx 의 MAX_TILES 와 반드시 같아야 한다 —
 * 그 파일은 고객 화면이라 여기서 고칠 수 없으므로 값을 옮겨 적고 주석으로 묶어 둔다.
 */
export const HOME_TILE_LIMIT = 8;

/**
 * 카테고리 이미지를 비워 두면 홈이 자동으로 걸어 주는 대체 사진.
 * CategoryShowcase.tsx 의 FALLBACK_IMAGES 와 같은 목록·같은 순서다(i % 8).
 * "비워 두면 아무것도 안 나온다" 고 믿는 것을 막으려면 실제로 걸릴 사진을 보여 줘야 한다.
 */
export const HOME_FALLBACK_IMAGES = [
  "/editorial/guksi-wood.jpg",
  "/editorial/somyeon-bowl.jpg",
  "/editorial/rice-table.jpg",
  "/editorial/miyeok-noodle-bowl.jpg",
  "/editorial/yeoju-rice.jpg",
  "/editorial/buckwheat-noodle.jpg",
  "/editorial/tteok-bowl.jpg",
  "/editorial/bunmoja-white.jpg",
];

/** 이 자리(순서)에 이미지를 비워 두면 홈에 실제로 걸리는 사진 */
export function homeFallbackImage(index: number): string {
  return HOME_FALLBACK_IMAGES[index % HOME_FALLBACK_IMAGES.length];
}

/* ---------- 화면 문구 ---------- */

export const ORDER_GUIDE =
  "고객에게 노출한 카테고리 중 순서가 가장 앞선 하나가 홈 화면의 큰 사진이 되고, 홈에는 앞에서 8개까지만 나옵니다. 전체 상품 페이지의 탭은 이 순서 그대로 전부 표시됩니다.";

export const ORDER_HOW_TO =
  "손잡이를 끌어서 옮기거나, 위·아래 화살표를 누르세요.";

/* 이미지·설명이 "고객 화면 어디에 쓰이는가" 는 실제 코드를 열어 확인하고 적었다.
   전에 적혀 있던 "이미지가 전체 상품 페이지 상단에 쓰인다" 는 사실이 아니다 —
   (shop)/products/page.tsx 는 카테고리의 description 만 쓰고 image_url 은 쓰지 않는다.
   화면이 거짓을 말하면 대표는 안 쓰이는 자리를 맞추느라 사진을 다시 만든다. */
export const IMAGE_USAGE_HELP =
  "홈 화면의 카테고리 타일 배경으로만 쓰입니다(전체 상품 페이지에는 쓰이지 않습니다). 가로 1,600px 이상을 권합니다. 자리마다 잘리는 모양이 달라지니 글자·인물은 가장자리에 두지 마세요.";

export const DESCRIPTION_USAGE_HELP =
  "홈 화면 타일의 이름 아래에 한 줄로, 전체 상품 페이지에서 이 카테고리를 골랐을 때 제목 아래 문장으로 보입니다. 검색 결과에 뜨는 설명에도 쓰입니다. 홈 타일에서는 한 줄이 넘으면 잘립니다.";

export const ADDRESS_USAGE_HELP =
  "고객이 이 카테고리를 볼 때 쓰는 주소입니다. 보통은 그대로 두면 됩니다.";

export const ADDRESS_CHANGE_WARNING =
  "주소를 바꾸면 지금까지 인스타·블로그·문자에 뿌린 링크가 전부 전체 상품 목록으로 떨어집니다. 옛 주소를 새 주소로 이어 주는 장치는 없습니다.";

export const HIDE_WITH_PRODUCTS_WARNING =
  "카테고리를 숨기면 고객 화면에서 이 탭만 사라집니다. 소속 상품은 전체 상품 목록에 그대로 남아 계속 팔립니다. 상품까지 내리려면 상품 관리에서 각 상품의 상태를 바꿔 주세요.";

/**
 * 목록 순서대로 훑으며 "이 행이 홈에서 몇 번째 타일이 되는가" 를 매긴다. 숨긴 행은 null.
 *
 * 왜 관리자 목록의 자리(index)를 그대로 쓰면 안 되는가:
 * 홈에 내려가는 목록은 노출 카테고리만이다((shop)/page.tsx → getCachedCategories 가
 * is_active=true 로 거른다). 그래서 중간에 숨긴 카테고리가 하나만 있어도 홈 자리가
 * 한 칸씩 당겨진다 — 지금 실제로 5번째 '대용량·업소용' 이 숨김이라, 그 아래 행들은
 * 관리자 자리보다 홈에서 한 칸 앞이다. 이걸 맞추지 않으면 '홈 대표 타일' 뱃지도,
 * 비었을 때 홈이 걸어 주는 대체 사진도 전부 엉뚱한 행에 붙는다.
 */
export function homePositions(rows: CategoryRow[]): (number | null)[] {
  let next = 0;
  return rows.map((row) => (row.is_active ? next++ : null));
}

/** 이 홈 자리에 놓이면 홈에 안 나온다 (숨긴 행은 애초에 홈에 없으므로 여기 오지 않는다) */
export function isBelowHomeFold(homeIndex: number): boolean {
  return homeIndex >= HOME_TILE_LIMIT;
}

/** 목록 한 줄에 붙는 상품 수 설명 — 관리자 수와 고객 수가 다르다는 걸 말로 풀어 준다 */
export function countTooltip(row: CategoryRow): string {
  return `고객에게 보이는 상품 ${row.visible_count}개(판매중·품절) / 임시저장·숨김까지 더한 전체 ${row.product_count}개`;
}
