# 스토어프론트 공용 컴포넌트 레퍼런스

`src/components/shop/` 의 공용 셸/표시 컴포넌트 사용법. **다른 팀은 이 문서만 보고 쓰면 된다.**
모두 default export이며, 타입은 각 파일에서 named export 된다.

---

## 레이아웃 셸 — `src/app/(shop)/layout.tsx`

(shop) 그룹의 모든 페이지는 자동으로 `Header + <main class="flex flex-1 flex-col"> + Footer + SmoothScroll` 셸 안에서 렌더된다.
서버에서 로그인 유저(`supabase.auth.getUser()`)와 활성 카테고리(`is_active=true, sort_order asc`)를 조회해 Header에 내려준다.
**페이지에서 Header/Footer를 다시 import하지 말 것.**

### 헤더 높이와 홈 히어로

- 헤더는 `sticky top-0` 이며 **높이 `h-16`(64px) / md 이상 `h-20`(80px)** 으로 문서 흐름에 공간을 차지한다.
- 일반 페이지는 신경 쓸 것 없음 — 콘텐츠가 헤더 아래부터 자연스럽게 시작된다.
- **홈 히어로를 헤더 뒤로 깔고 싶으면** 첫 섹션에 `-mt-16 md:-mt-20` 을 주면 된다.
  헤더는 홈(`/`) 최상단에서만 투명 + 밝은 글자(cream-50)로 렌더되므로, **홈 히어로 상단은 어두운 이미지/forest 톤이어야 한다.**
  스크롤하면 자동으로 `cream-50/95 blur + hairline-b` 로 전환된다.

---

## SmoothScroll

```tsx
import SmoothScroll from "@/components/shop/SmoothScroll";

<SmoothScroll>{children}</SmoothScroll>
```

| prop | 타입 | 설명 |
|---|---|---|
| children | `ReactNode` | 그대로 통과 렌더 (DOM 노드 추가 없음) |

- lenis 기반. `prefers-reduced-motion: reduce` 면 아예 활성화하지 않는다.
- (shop) 레이아웃에 이미 적용되어 있으므로 **페이지에서 다시 쓰지 말 것.**
- 내부 스크롤 영역(모달, 오버레이 등)에는 `data-lenis-prevent` 속성을 붙이면 lenis가 개입하지 않는다.

## Reveal

스크롤 리빌 래퍼. 뷰포트에 들어오면 `.is-inview` 를 붙이고 **한 번 보이면 유지**한다.

```tsx
import Reveal from "@/components/shop/Reveal";

<Reveal><SectionTitle title="이달의 추천" /></Reveal>
<Reveal as="li" delay={0.15}>…</Reveal>
<Reveal variant="clip" className="aspect-[4/5]"><Image … /></Reveal>
```

| prop | 타입 | 기본 | 설명 |
|---|---|---|---|
| as | `ElementType` | `"div"` | 렌더 태그 (`"section"`, `"li"`, `"figure"` 등) |
| className | `string` | | 추가 클래스 |
| delay | `number` | `0` | 지연(초) — `--reveal-delay` CSS 변수로 전달 |
| variant | `"fade" \| "clip"` | `"fade"` | fade = `.reveal`(아래서 떠오름), clip = `.reveal-clip`(클립 드러남) |
| style | `CSSProperties` | | 인라인 스타일 (delay와 병합됨) |

- 그리드 스태거: `items.map((it, i) => <Reveal key={it.id} delay={i * 0.06}>…</Reveal>)`
- 클라이언트 컴포넌트지만 서버 컴포넌트 children을 그대로 받을 수 있다.

## Header

레이아웃 전용 — **직접 쓸 일 없음.** 시그니처만 참고.

```tsx
import Header, { type HeaderUser, type ShopCategory } from "@/components/shop/Header";

interface HeaderProps {
  user: HeaderUser | null;      // { id, email, name }
  categories: ShopCategory[];   // { id, slug, name } — 활성/정렬 완료 상태로 전달
}
```

- 내비: 전체상품 `/products` · 카테고리 드롭다운(`/products?category=[slug]`) · 브랜드스토리 `/about` · 고객센터 `/support`
- 검색 아이콘 → 풀와이드 오버레이 → `/search?q=…` 로 이동
- 장바구니 뱃지는 `useCart` 수량 합계 (hydration 후에만 표시)
- VIP 라운지(`/vip`)는 우측의 브라스 점 하나 (데스크톱) / 모바일 메뉴 하단 라벨
- 모바일: 햄버거 → 풀스크린 오버레이 (세리프 대형 링크, 스태거 등장)

## Footer

props 없음. forest-950 다크 푸터 (회사정보 = `COMPANY` 상수). 레이아웃 전용.

## ProductCard

상품 카드. **서버/클라이언트 겸용** (자체적으로 "use client" 없음).

```tsx
import ProductCard from "@/components/shop/ProductCard";

<div className="grid grid-cols-2 gap-x-3 gap-y-10 md:grid-cols-3 xl:grid-cols-4 md:gap-x-4">
  {products.map((p, i) => (
    <ProductCard key={p.id} product={p} priority={i < 4} />
  ))}
</div>
```

| prop | 타입 | 기본 | 설명 |
|---|---|---|---|
| product | `ProductWithImages \| PricedProduct` | 필수 | `product_images` 조인 필수, `categories` 조인 권장 |
| priority | `boolean` | `false` | 첫 화면 카드만 true (LCP 이미지) |
| className | `string` | | 추가 클래스 |

동작 규칙:
- 이미지: `is_primary` 우선, 없으면 `sort_order` 첫 장. 4:5 비율 + 호버 줌(`.showcase-img`). 이미지 없으면 cream 플레이스홀더.
- 뱃지: `product.badges` 앞 2개를 이미지 좌상단에 label-caps로.
- 품절: `status === "sold_out"` 또는 `stock <= 0` 이면 "일시품절" 오버레이.
- 가격: `PricedProduct` 면 `effective_price` 기준. VIP가가 정가보다 낮으면 정가 취소선 + 브라스 `VIP` 라벨. 아니면 `compare_at_price` 취소선 + 할인율.
- 보관: `storage_type` → 실온/냉장/냉동 태그.
- 상품 목록 조회 예시(select): `*, product_images(*), categories(id, slug, name)`

## PriceTag

가격 표시 단독 컴포넌트 (서버/클라이언트 겸용). ProductCard 내부에서도 사용.

```tsx
import PriceTag from "@/components/shop/PriceTag";

<PriceTag price={12900} />
<PriceTag price={12900} compareAt={16500} size="lg" />          // 22% 12,900원 ~~16,500원~~
<PriceTag price={9900} compareAt={12900} vipApplied size="md" /> // VIP 23% 9,900원 ~~12,900원~~
```

| prop | 타입 | 기본 | 설명 |
|---|---|---|---|
| price | `number` | 필수 | 실제 판매가 |
| compareAt | `number \| null` | | price보다 클 때만 취소선+할인율(forest-600) 표시 |
| vipApplied | `boolean` | `false` | 브라스 `VIP` 라벨 표시 |
| size | `"sm" \| "md" \| "lg"` | `"md"` | sm=카드, md=목록/장바구니, lg=상품 상세 |
| className | `string` | | |

## QtyStepper (client)

```tsx
import QtyStepper from "@/components/shop/QtyStepper";

<QtyStepper value={qty} onChange={setQty} max={product.stock} />
```

| prop | 타입 | 기본 | 설명 |
|---|---|---|---|
| value | `number` | 필수 | 현재 수량 |
| onChange | `(value: number) => void` | 필수 | clamp(min~max)된 값이 넘어온다 |
| min | `number` | `1` | |
| max | `number` | `99` | 재고 상한을 넘기면 안 될 때 지정 |
| className | `string` | | |

높이 40px(`h-10`), 헤어라인 보더. 한계값에서 버튼 자동 disabled.

## SectionTitle

```tsx
import SectionTitle from "@/components/shop/SectionTitle";

<SectionTitle
  overline="Fermented Konjac"
  title="이달의 추천"
  action={{ href: "/products", label: "전체 보기" }}
  className="mb-10"
/>
```

| prop | 타입 | 설명 |
|---|---|---|
| overline | `string?` | label-caps 오버라인 (forest-600) — 영문 권장 |
| title | `string` | headline-serif 타이틀 |
| action | `{ href: string; label: string }?` | 우측 하단 정렬 링크 (link-line) |
| className | `string?` | |

## EmptyState

```tsx
import EmptyState from "@/components/shop/EmptyState";

<EmptyState
  title="장바구니가 아직 비어 있습니다."
  description="발효가 완성한 곤약의 식탁을 천천히 둘러보세요."
  action={{ href: "/products", label: "상품 보러 가기" }}
/>
```

| prop | 타입 | 설명 |
|---|---|---|
| title | `string` | 세리프 문장 (마침표까지 완결된 한 문장 권장) |
| description | `string?` | 보조 설명 |
| action | `{ href: string; label: string }?` | 보더 버튼 (호버 시 반전) |
| className | `string?` | |

## Skeleton / ProductCardSkeleton

```tsx
import Skeleton, { ProductCardSkeleton } from "@/components/shop/Skeleton";

<Skeleton className="h-4 w-40" />
<Skeleton className="aspect-[4/5] w-full" />

// loading.tsx 에서:
<div className="grid grid-cols-2 gap-x-3 gap-y-10 md:grid-cols-3 xl:grid-cols-4">
  {Array.from({ length: 8 }).map((_, i) => <ProductCardSkeleton key={i} />)}
</div>
```

| 컴포넌트 | prop | 설명 |
|---|---|---|
| Skeleton | `className?` | 펄스 블록 — 크기는 className으로 (`h-* w-*` 또는 `aspect-*`) |
| ProductCardSkeleton | `className?` | ProductCard와 동일 실루엣 |

## Marquee

```tsx
import Marquee from "@/components/shop/Marquee";

<Marquee className="hairline-t hairline-b py-4">
  {["HACCP", "FSSC 22000", "VEGAN", "HALAL"].map((t) => (
    <span key={t} className="label-caps mx-8 text-ink-400">{t}</span>
  ))}
</Marquee>
```

| prop | 타입 | 설명 |
|---|---|---|
| children | `ReactNode` | 내부에서 2회 복제됨 — 한 벌만 넘길 것. 화면 폭보다 길어야 자연스럽다 |
| className | `string?` | 외곽 래퍼 클래스 |

`prefers-reduced-motion` 사용자는 흐름이 정지된다.

---

## 공통 주의사항

- 이 문서의 컴포넌트 파일들은 셸 팀 소유 — 수정이 필요하면 직접 고치지 말고 요청할 것.
- ProductCard/PriceTag/SectionTitle/EmptyState/Skeleton/Marquee/Footer는 서버 컴포넌트에서 바로 사용 가능.
- Reveal/QtyStepper/Header/SmoothScroll은 client 컴포넌트 (서버에서 import해 렌더하는 것은 가능).
- VIP 다크 화면(forest-950 배경)에서는 ProductCard의 ink 텍스트가 안 보이므로, VIP 팀은 자체 카드 스타일을 쓰거나 셸 팀에 다크 변형을 요청할 것.
