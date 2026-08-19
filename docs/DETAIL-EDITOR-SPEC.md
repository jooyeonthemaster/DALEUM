# 상세페이지 편집기 v2 — 확정 스펙 (SSOT)

> 이 문서가 유일한 진실이다. 모든 구현·검수 에이전트는 여기만 읽는다.
> 채팅 맥락이 아니라 이 문서가 바뀌어야 요구사항이 바뀐 것이다.

## 0. 문제 (실측)

관리자 「고객 화면으로 보기」가 상세 이미지를 **1066px** 폭으로 그린다.
고객이 실제로 보는 폭은 다음과 같다 (localhost:3210, 실측 2026-08-19):

| 뷰포트 | 상세 섹션 컨테이너 | 이미지 렌더 폭 |
|---|---|---|
| PC 1920 | 768px (`max-w-3xl`) | **766px** |
| PC 1440 | 768px | **766px** |
| 태블릿 768 | 697px | 695px |
| 모바일 390 | **350px** | **348px** |

> ⚠️ **모바일 값 정정 (2026-08-20 재실측).**
> 처음에 모바일을 340/338 로 적었는데 그것은 **데스크톱 브라우저의 스크롤바 10px** 이
> 뷰포트를 먹은 상태의 값이었다(`innerWidth 390` 인데 `clientWidth 380`).
> 실제 휴대폰은 오버레이 스크롤바라 폭을 먹지 않는다. 스크롤바를 없애고 다시 재면:
>
> | | 스크롤바 있음(데스크톱) | 오버레이(실제 폰) |
> |---|---|---|
> | `document.documentElement.clientWidth` | 380 | **390** |
> | `.container-hall` (padding 20px) | 380 | **390** |
> | 콘텐츠 칼럼 | 340 | **350** |
> | 이미지 | 338 | **348** |
>
> 따라서 **모바일 콘텐츠 폭은 350px** 이다 = 390 − (gutter 20 × 2).
> gutter 는 `--spacing-gutter: clamp(1.25rem, 4vw, 3.5rem)` 이고 390px 에서 4vw=15.6px 이므로
> 하한 1.25rem(=20px)이 이긴다. 25px 같은 임의값을 쓰면 안 된다.
>
> PC 는 영향 없다 — 1440에서 콘텐츠는 `max-w-3xl`(768px)이 가두므로 스크롤바와 무관하게 768 이다.
>
> **교훈**: 뷰포트 폭을 근거로 삼을 때는 `innerWidth` 가 아니라 `clientWidth` 를 봐야 하고,
> 모바일 실측은 스크롤바를 없앤 상태에서 해야 한다.

→ 관리자 화면은 PC 대비 **1.39배**, 모바일 대비 **3.15배** 확대되어 있다.
관리자는 자기가 무엇을 만들고 있는지 볼 수 없다. **이것이 근본 결함이다.**

## 1. 성공조건 (객관적 완료 정의)

1. **G1 정합**: 편집 캔버스가 같은 뷰포트의 고객 화면과 일치한다. PC·모바일 모두.
   - **G1-a 폭**: 이미지 렌더 폭이 **±2px 이내**.
     PC ✅ 766=766 달성 / 모바일 ❌ 편집기 338 vs 실제 폰 348 — **10px 좁다**(위 정정 참고)
   - **G1-b 타이포**: 문단·목록·소제목의 `font-size` / `line-height` / `color` / 목록 들여쓰기·마커가
     고객 화면과 **완전히 같아야** 한다. 폭만 맞고 글자 크기가 다르면 **줄바꿈 위치가 달라져**
     "고객 화면 그대로" 가 거짓이 된다.

     ❌ **미달 (2026-08-20 실측)** — 편집 캔버스에 detail-prose 클래스가 하나도 붙지 않아
     Tailwind preflight 기본값으로 그려지고 있었다:

     | 항목 | 고객 | 편집기 | |
     |---|---|---|---|
     | 문단 font-size | 14px(lead)/15px(flow) | **16px** | ✗ |
     | line-height | 25.9px | **24px** | ✗ |
     | 글자색 | ink-600 `rgb(76,83,71)` | **ink-900 `rgb(25,28,24)`** | ✗ |
     | 목록 들여쓰기 | 20px | **0px** | ✗ |
     | 목록 마커 | `—` (::before) | **없음** | ✗ |

     원인: `extensions.ts` 가 노드에 `HTMLAttributes.class` 를 주지 않는다.
     고치는 방법은 detail-prose.ts 상수를 **스키마에서 주입**하는 것뿐이다 —
     globals.css 에 값을 다시 적는 것은 §8 위반(단일 진실 파괴).
2. **G2 무회귀**: 기존 27개 상품의 고객 화면 렌더 결과가 변경 전과 **완전히 동일**하다 (DOM 구조 + 이미지 URL/순서 + 텍스트).
3. **G3 행동**: Playwright 실조작으로 ①이미지 폭 드래그 ②블록 순서 드래그 ③크롭 ④PC/모바일 전환 ⑤저장→재로드 왕복이 전부 성공한다.
4. **G4 빌드**: `npx tsc --noEmit` 0 오류, `npm run build` 성공, `npx eslint` 0 오류.
5. **G5 콘솔**: 편집기 조작 중 브라우저 콘솔 error 0건.

## 2. 문서 모델 (v2)

```ts
type DetailDoc = { version: 2; blocks: DetailNode[] };

type DetailNode =
  | { id: string; type: "heading";   level: 2 | 3; align: Align; text: Inline[] }
  | { id: string; type: "paragraph"; align: Align; size: TextSize; text: Inline[] }
  | { id: string; type: "list";      ordered: boolean; items: Inline[][] }
  | { id: string; type: "quote";     text: Inline[] }
  | { id: string; type: "divider" }
  | { id: string; type: "spacer";    size: "sm" | "md" | "lg" }
  | { id: string; type: "image";     src: string; alt: string;
      width: number; height: number;        // 원본(또는 크롭 결과) 실제 픽셀
      widthPct: number;                     // 5..100, 콘텐츠 칼럼 대비 %
      align: "left" | "center" | "right";
      sourceUrl?: string;                   // 크롭 전 원본 — 재크롭용
      lead?: never };

type Inline = { text: string; bold?: boolean; accent?: boolean };
type Align = "left" | "center" | "right";
type TextSize = "sm" | "base" | "lg";
```

### 2.1 `lead` — 구매 영역 요약 (하위호환의 핵심)

텍스트 노드(`heading`/`paragraph`/`list`)만 `lead?: boolean` 을 가진다.

- `lead: true` → 고객 화면 **가격 옆 구매 박스**에 실린다 (오늘과 동일, `Expandable lines={7}`).
- `lead` 아님 → 고객 화면 **하단 「상품 상세」** 에 이미지와 **순서대로 섞여** 흐른다.

**레거시 마이그레이션 규칙 (무회귀 보장):**
기존 마크다운을 파싱할 때 **모든 텍스트 노드에 `lead: true`** 를 부여한다.
그러면 하단 섹션 = 이미지만 = **오늘과 완전히 동일**하다.
(실측 근거: 운영 27개 상품 전부가 "텍스트 덩어리 → 이미지 덩어리" 순서이며,
텍스트와 이미지가 두 번 이상 교차하는 상품은 **0개**다. 따라서 순서 보존 손실이 없다.)

신규/편집 상품은 관리자가 블록별로 `lead` 를 껐다 켤 수 있어 블로그형 흐름이 가능해진다.

### 2.2 타이포그래피는 **프리셋만** 준다

글꼴 패밀리·임의 크기·임의 색상은 주지 않는다 (브랜드 붕괴 방지 — 기존 코드베이스의 확립된 입장).
관리자가 고를 수 있는 것은:
- 블록 종류: 큰제목(h2) / 작은제목(h3) / 본문 / 인용 / 목록(순서·비순서)
- 본문 크기: 작게(sm) / 기본(base) / 크게(lg)
- 정렬: 왼쪽 / 가운데 / 오른쪽
- 인라인: **굵게**, 강조색(forest-700) 1종

이것이 사용자 요구 "텍스트 폰트 설정"의 브랜드 안전한 착지점이다.

## 3. 저장

### 3.1 컬럼
마이그레이션 `0007_product_description_doc.sql`:
```sql
alter table daleum.products add column if not exists description_doc jsonb;
```
`PRODUCT_DETAIL_SELECT` 가 `*` 이므로 자동으로 흘러든다.

### 3.2 이중 표기 (mirror)
- `description_doc` (jsonb) = **진실**. 새 편집기가 쓴다.
- `description` (text) = **파생 미러**. 저장할 때마다 doc → 레거시 마크다운으로 직렬화해 함께 쓴다.
  - 이유: 메타데이터 `slice(0,160)`, b2b 페이지, `computeHealth`, `scripts/verify_catalog.mjs`,
    일괄 등록 시트가 전부 `description` 을 읽는다. 미러를 유지하면 **어느 것도 손대지 않아도 된다.**
  - 미러는 이미지 `widthPct`/정렬 같은 v2 전용 속성을 **버린다**(레거시 문법에 자리가 없다). 정상이다 — 미러는 읽기 전용 폴백이다.

### 3.3 렌더 분기 (고객 화면)
```
description_doc 있음 → DetailDocRenderer(doc)      // v2
description_doc 없음 → DescriptionBlock(description) // 오늘 그대로, 코드 무수정
```
→ 손대지 않은 27개 상품은 **기존 코드 경로를 그대로 탄다**. G2 무회귀가 구조적으로 보장된다.

## 4. 편집 캔버스 — 1:1 실측

### 4.1 스테이지 규격
| 모드 | 캔버스 폭 | 근거 |
|---|---|---|
| PC | **768px** | 고객 `max-w-3xl` |
| 모바일 | **390px** | iPhone 기준폭. 콘텐츠 칼럼은 **350px**(=390−20×2) |

캔버스는 고객 상세 섹션과 **동일한 CSS**를 쓴다. 스타일을 복붙하지 말고
`src/components/catalog/detail-prose.ts` 의 **단일 클래스 상수**를 고객 렌더러와 편집기가 공유한다.
(복사본 두 벌은 반드시 갈라진다 — 공유 원인 하나로 묶는다.)

### 4.2 공간이 모자랄 때만 축소
가용 폭 < 캔버스 폭이면 스테이지 전체에 `transform: scale(k)`, `transform-origin: top center`.
`k = available / canvasWidth`, 최대 1 (**확대는 절대 하지 않는다**).
k 는 상태로 보관하고 모든 포인터 좌표 변환에 쓴다 (§5).

### 4.3 PC ↔ 모바일 전환
`width` 를 `420ms var(--ease-silk)` 로 트랜지션한다.
`transform: scale` 로 흉내내지 않는다 — 모바일의 **실제 줄바꿈**을 보여줘야 하기 때문이다.
이미지는 `aspect-ratio` 로 자리를 예약해 전환 중 점프가 없게 한다.

## 5. 이미지 리사이즈 — 좌표 설계 (최난이도)

**원칙: 모든 계산은 문서 공간(캔버스 미축소 CSS px)에서 한다. 화면 공간 좌표는 즉시 변환해 버린다.**

```
docX = (e.clientX - stageRect.left) / k
```

### 5.1 저장 단위는 % (px 아님)
같은 문서가 768(PC)과 340(모바일)에서 렌더된다. 절대 px 을 저장하면 모바일에서 넘친다.
→ `widthPct` (5~100). 렌더 폭 = `contentWidth * widthPct / 100`.

### 5.2 종횡비는 항상 잠근다
높이는 저장하지 않고 원본 `width/height` 에서 파생한다.
**이것이 "안 깨짐"의 유일한 보장이다.** 자유 변형은 제품 사진을 왜곡시키므로 제공하지 않는다.

### 5.3 드래그 수식
```
onPointerDown:  setPointerCapture, startDocX, startPct, side(-1 left | +1 right)
onPointerMove:  deltaPx  = (docX - startDocX) * side
                deltaPct = deltaPx / contentWidth * 100 * (center정렬 ? 2 : 1)
                next     = clamp(startPct + deltaPct, 5, 100)
                snap     = [25, 33.33, 50, 66.67, 75, 100] 중 |next-s| < 2.5 이면 s
onPointerUp:    releasePointerCapture, 최종값만 TipTap 커밋
```

### 5.4 부드러움 (60fps 보장)
- `pointermove` 마다 React state 를 바꾸지 **않는다**. 래퍼 DOM 의 `style.width` 를 직접 쓴다.
- `requestAnimationFrame` 으로 한 프레임에 한 번만 기록 (이벤트 합침).
- 핸들에 `touch-action: none`, 스테이지에 `user-select: none` (드래그 중).
- 커밋은 `pointerup` 단 한 번 → 실행취소 스택이 드래그당 1개.

### 5.5 크롭
기존 `lib/image-pipeline.ts` 의 `cropImage()` 를 재사용한다(이미 존재·검증됨).
크롭은 **굽는다**(새 파일 업로드). `sourceUrl` 에 원본을 남겨 재크롭이 원본에서 다시 시작되게 한다.
CSS 로 흉내내지 않는 이유: next/image 가 자연스럽게 동작하고 고객 전송량이 준다.

## 6. 상호작용 요구 (사용자 원문)

| 요구 | 착지 |
|---|---|
| 블로그처럼 글쓰기 | TipTap 3 (`@tiptap/react` 3.30.2, React 19 지원 확인됨) |
| 이미지 드래그 삽입 | 캔버스에 파일 드롭 → 커서 위치에 삽입 |
| 순서 변경 | 블록 드래그 핸들 + `Alt+↑/↓` |
| 텍스트 삽입 | 슬래시 메뉴 + 툴바 |
| 텍스트 폰트 설정 | §2.2 프리셋 |
| 실시간 PC/모바일 | §4.3 |
| 이미지 자르기 | §5.5 |
| 이미지 드래그 확대 | §5.1–5.4 |

## 7. 검증 게이트

- **계기(타이포)**: 폭만 재는 게이트는 위 G1-b 결함을 놓쳤다(실제로 놓쳤다).
  게이트는 반드시 `getComputedStyle` 로 font-size/line-height/color/padding-left 까지 비교해야 한다.
- **계기**: `scripts/verify_detail_parity.mjs` — 편집 캔버스와 고객 화면의 렌더 폭을 같은 뷰포트에서 재어 ±2px 초과 시 실패.
  **음성테스트 필수**: 일부러 캔버스 폭을 800px 로 틀어 게이트가 울리는지 확인한 뒤 되돌린다.
  울리지 않으면 그 게이트는 신뢰할 수 없다.
- **행동 게이트**: Playwright 로 실제 드래그/크롭/전환/저장 수행 (스크린샷만으로는 통과시키지 않는다).
- **무회귀**: 27개 상품 고객 페이지 DOM 스냅샷을 변경 전/후 비교.

## 8. 금지 사항 (위반 시 critical)

- 고객 화면 기존 렌더 경로(`DescriptionBlock`)를 **삭제·변경하지 말 것**. 레거시 폴백이다.
- 캔버스 스타일을 고객 렌더러에서 **복사**하지 말 것. §4.1 공유 상수를 쓸 것.
- 이미지 높이를 저장하거나 자유 변형을 허용하지 말 것 (§5.2).
- 임의 글꼴·색상 피커를 넣지 말 것 (§2.2).
- 없는 수치를 만들어 쓰지 말 것 — 폭·비율은 §0 실측값만 쓴다.
- 파일 500줄 초과 금지 (400줄에서 분할 경고).
