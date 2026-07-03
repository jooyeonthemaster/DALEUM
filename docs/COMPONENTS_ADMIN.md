# 관리자 UI 킷 — 컴포넌트 레퍼런스

관리자 페이지 4개 팀 공용. 모든 화면은 이 킷 위에서 만든다.
디자인 원칙: cream-50 배경 · forest 액센트 · 헤어라인(border-ink-200) · Pretendard 중심(세리프는 빈 상태 문장 등 최소) · 이모지 금지 · 아이콘은 lucide `strokeWidth={1.5}` 최소한만.

모든 컴포넌트 경로: `@/components/admin/*`

---

## 셸 (자동 적용 — 페이지 팀은 신경 쓸 필요 없음)

`src/app/admin/layout.tsx`가 서버에서 관리자 이름을 조회해 `AdminShell`로 감싼다.
role 가드는 미들웨어가 수행한다. 페이지는 콘텐츠만 렌더하면 된다.

- **AdminShell** `{ adminName: string | null, children }` — 데스크톱: 좌측 고정 사이드바(w-60) + 상단바. 모바일: 햄버거 → 드로어.
- **AdminSidebar** `{ onNavigate?: () => void }` — 메뉴 정의는 `ADMIN_MENU` export. 현재 경로 하이라이트(좌측 forest-600 바). 유틸 export: `findActiveHref(pathname)`, `findAdminTitle(pathname)`.
- **AdminHeader** `{ adminName, onMenuClick?, title? }` — `title` 생략 시 현재 경로에서 메뉴 라벨을 추론 (예: `/admin/orders/123` → "주문 관리"). 우측: 관리자 이름 + 로그아웃(Supabase signOut → /login).

상단바 타이틀은 메뉴 라벨 수준까지만 표시된다. 상세 페이지 제목(주문번호 등)은 페이지 본문에서 직접 렌더할 것.

페이지 메타데이터: admin 레이아웃에 `title.template: "%s — 다름 관리자"`가 걸려 있으니 각 페이지에서 `export const metadata = { title: "주문 관리" }`만 선언하면 된다.

---

## DataTable — 제네릭 테이블 (client)

데스크톱은 테이블, 모바일(<md)은 카드 리스트로 자동 전환.
모바일 카드는 **첫 번째 컬럼을 제목**으로, 나머지를 라벨/값 쌍으로 표시한다.

```ts
interface DataTableColumn<T> {
  key: string;                    // render 없으면 row[key]를 문자열 출력
  label: string;
  width?: string;                 // "120px" | "18%"
  align?: "left" | "center" | "right";
  render?: (row: T) => ReactNode;
  hideOnMobile?: boolean;         // 모바일 카드에서 숨김
}

interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey?: (row: T, index: number) => string | number; // 기본: row.id → index
  onRowClick?: (row: T) => void;  // 지정 시 행 hover/커서 처리
  loading?: boolean;              // cream-100 펄스 스켈레톤
  emptyMessage?: string;          // 기본 "표시할 항목이 없습니다." (세리프 빈 상태)
  pagination?: ReactNode;         // 하단 슬롯 — 보통 <Pagination />
  className?: string;
}
```

```tsx
<DataTable<Order>
  columns={[
    { key: "order_no", label: "주문번호", width: "160px" },
    { key: "orderer", label: "주문자", render: (o) => o.orderer.name },
    { key: "total", label: "결제 금액", align: "right", render: (o) => `${krw(o.total)}원` },
    { key: "status", label: "상태", align: "center", render: (o) => <StatusChip status={o.status} /> },
    { key: "created_at", label: "주문일시", hideOnMobile: true, render: (o) => formatDateTime(o.created_at) },
  ]}
  rows={orders}
  loading={loading}
  onRowClick={(o) => router.push(`/admin/orders/${o.id}`)}
  pagination={<Pagination page={page} totalPages={totalPages} onChange={setPage} />}
/>
```

## Pagination (client)

```ts
{ page: number; totalPages: number; onChange: (page: number) => void; className?: string }
```

totalPages ≤ 1이면 렌더하지 않음. `1 … 4 5 6 … 20` 윈도우 방식.

## StatCard — 대시보드 KPI (server 가능)

```ts
{ label: string; value: ReactNode; sub?: ReactNode; tone?: "default" | "up" | "down"; className?: string }
```

`tone`은 sub 문구 색만 바꾼다 (up → forest-600, down → signal-red).

```tsx
<div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
  <StatCard label="오늘 매출" value={`${krw(todaySales)}원`} sub="어제보다 +12%" tone="up" />
  <StatCard label="신규 주문" value={12} sub="결제 완료 기준" />
</div>
```

## StatusChip — 주문 상태 칩 (server 가능)

```ts
{ status: OrderStatus; className?: string }
```

라벨/색은 `@/lib/constants`의 `ORDER_STATUS_LABELS` / `ORDER_STATUS_TONES`를 그대로 사용.

## Tabs — 언더라인 탭 (client)

```ts
{ tabs: { key: string; label: string; count?: number }[]; active: string; onChange: (key: string) => void; className?: string }
```

```tsx
<Tabs
  tabs={[
    { key: "all", label: "전체", count: 128 },
    { key: "paid", label: "결제 완료", count: 44 },
  ]}
  active={tab}
  onChange={setTab}
/>
```

## Modal — 접근성 모달 (client)

```ts
{ open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode;
  size?: "sm" | "md" | "lg" }   // 기본 md(32rem), lg는 48rem
```

- ESC / 백드롭 클릭으로 닫힘, 포커스 트랩, 배경 스크롤 잠금, 닫힐 때 이전 포커스 복원
- 모바일: 하단 시트처럼 붙음, sm 이상: 중앙 정렬
- `document.body`에 포탈 렌더 (z-[100])

```tsx
<Modal open={open} onClose={() => setOpen(false)} title="운송장 등록"
  footer={<button className="bg-forest-700 px-4 py-2 text-sm text-cream-50 hover:bg-forest-800">저장</button>}>
  …폼 내용…
</Modal>
```

## ConfirmDialog — 파괴적 액션 확인 (client)

```ts
{ open: boolean; onClose: () => void; onConfirm: () => void | Promise<void>;
  title: string; description: string; confirmLabel?: string; danger?: boolean }
```

- `onConfirm`이 Promise면 완료까지 버튼 잠금("처리 중…") 후 **성공 시 자동으로 onClose**
- `onConfirm`이 throw하면 다이얼로그는 열린 채 유지 — 에러 표시는 호출부 책임
- `danger`면 확인 버튼이 signal-red

```tsx
<ConfirmDialog
  open={deleting !== null}
  onClose={() => setDeleting(null)}
  onConfirm={async () => { await deleteProduct(deleting!); refresh(); }}
  title="상품 삭제"
  description="삭제한 상품은 복구할 수 없습니다. 계속하시겠습니까?"
  confirmLabel="삭제"
  danger
/>
```

## Field — 폼 프리미티브 (client, 네임드 export)

```ts
import { Label, Input, Textarea, Select, Toggle, FieldRow, Help } from "@/components/admin/Field";
```

| 컴포넌트 | props |
|---|---|
| `Label` | `ComponentProps<"label"> & { requiredMark?: boolean }` |
| `Input` | `ComponentProps<"input">` — 헤어라인 보더, 포커스 forest-600 |
| `Textarea` | `ComponentProps<"textarea">` (기본 rows=4) |
| `Select` | `ComponentProps<"select">` — **className은 래퍼 div에 적용** (폭 조절용), 커스텀 셰브론 |
| `Toggle` | `{ checked, onChange(checked), disabled?, label?, className? }` — role="switch" |
| `FieldRow` | `{ label, required?, help?, htmlFor?, children, className? }` — md 이상 라벨(11rem)+입력 수평, 미만 세로 스택 |
| `Help` | `{ children, tone?: "default" \| "error", className? }` |

FieldRow를 여러 개 쌓을 땐 부모에 `divide-y divide-ink-100` 권장:

```tsx
<div className="divide-y divide-ink-100">
  <FieldRow label="상품명" required htmlFor="name">
    <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
  </FieldRow>
  <FieldRow label="보관 방법" htmlFor="storage">
    <Select id="storage" className="max-w-60" value={storage} onChange={(e) => setStorage(e.target.value)}>
      <option value="room">실온</option>
      <option value="chilled">냉장</option>
      <option value="frozen">냉동</option>
    </Select>
  </FieldRow>
  <FieldRow label="판매 상태" help="끄면 스토어에서 숨겨집니다.">
    <Toggle checked={active} onChange={setActive} label="판매 중" />
  </FieldRow>
</div>
```

## ImageUploader — 다중 이미지 업로드 (client)

```ts
{ value: { url: string }[]; onChange: (next: { url: string }[]) => void;
  bucket?: string;      // 기본 "products" (허용: products | banners | reviews)
  prefix?: string;      // 저장 경로 접두어 — 예: 상품 id
  multiple?: boolean;   // 기본 true. false면 1장 교체 방식
  className?: string }
```

- `/api/admin/upload`로 순차 업로드 → 미리보기 그리드에 추가
- 순서 변경: 타일 하단 좌/우 버튼 (첫 번째 = 대표 이미지 배지)
- 클라이언트에서 이미지 MIME / 5MB 선검증, 실패 시 signal-red 에러 문구

```tsx
<ImageUploader value={images} onChange={setImages} bucket="products" prefix={productId} />
```

## SearchInput (client)

```ts
{ value: string; onChange: (value: string) => void; onSubmit?: () => void;
  placeholder?: string; className?: string }
```

Enter 입력 시 `onSubmit` 호출. 값 있으면 지우기 버튼 표시. 디바운스는 호출부에서.

## DateRange (client)

```ts
{ from: string; to: string; onChange: (next: { from: string; to: string }) => void; className?: string }
```

값은 `yyyy-mm-dd` (input[type=date]). from ≤ to가 되도록 min/max 상호 제약.

---

## API: POST /api/admin/upload

- `requireAdmin()` 검증 후 Supabase storage 업로드 (service client)
- FormData: `file`(필수) · `bucket`(기본 products, 허용: products/banners/reviews) · `prefix`(선택, `[a-zA-Z0-9/_-]`만 허용)
- 제한: 5MB, 이미지 MIME만 (JPG/PNG/WebP/GIF/AVIF — SVG 제외)
- 저장 경로: `{prefix}/{uuid}.{ext}` → 응답 `{ url: publicUrl }`
- 실패: `{ error: string }` + 400/401/403/500

---

## 버튼 스타일 가이드 (킷에 버튼 컴포넌트는 없음 — 아래 클래스 조합 사용)

```
주 액션:   bg-forest-700 px-4 py-2 text-sm text-cream-50 transition-colors hover:bg-forest-800 disabled:opacity-50
보조/고스트: border border-ink-200 bg-cream-50 px-4 py-2 text-sm text-ink-700 transition-colors hover:bg-cream-100
파괴적:    bg-signal-red px-4 py-2 text-sm text-cream-50 transition-colors hover:bg-[#9c3c27]
텍스트 링크: text-sm text-ink-600 hover:text-forest-700 (또는 .link-line)
```

라운딩은 rounded-none(기본값 그대로). 그림자 금지 — 깊이는 헤어라인과 배경톤 차이로.

## 페이지 공통 패턴

```tsx
// 목록 페이지 상단 툴바
<div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
  <SearchInput value={q} onChange={setQ} onSubmit={search} className="sm:max-w-72" />
  <div className="flex items-center gap-2">
    <DateRange from={from} to={to} onChange={({ from, to }) => setRange({ from, to })} />
    <button className="bg-forest-700 px-4 py-2 text-sm text-cream-50 hover:bg-forest-800">새 상품</button>
  </div>
</div>
```

- 섹션 카드가 필요하면: `border border-ink-200 bg-cream-50 p-5` (StatCard와 동일 문법)
- 금액은 항상 `krw()` 포맷터 + `krw` 유틸리티 클래스, `12,900원` 형식
- 날짜는 `formatDate` / `formatDateTime` (`@/lib/format`)
