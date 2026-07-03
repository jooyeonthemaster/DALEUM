# DALEUM 자사몰 — 구현 컨텍스트 (모든 구현 에이전트 필독)

## 0. 프로젝트 정체성

**(주)다름 DALEUM** — 국내 최초 효모·유산균 **발효곤약** 식품 회사의 자사몰.
소비자 브랜드 **마틴조** (안경 쓴 대표 캐릭터). 슬로건: **"곤약 그 이상의 한계를 발효로 완성하다."**
인증: HACCP · FSSC 22000 · VEGAN · HALAL · 특허 2건. 마켓컬리/쿠캣/대상 등 21개사 OEM 이력.

**디자인 컨셉: "조용한 럭셔리 프레시 홀"** — 현대백화점 명품 식품관의 절제된 고급감.
마켓컬리의 신선함 + 백화점 식품관의 에디토리얼 럭셔리. 푸릇푸릇하지만 촌스럽지 않게.

## 1. 디자인 시스템 (globals.css에 토큰 정의됨 — 반드시 이 토큰만 사용)

### 컬러 (Tailwind 클래스로 사용)
- 배경: `bg-cream-50`(기본 아이보리) `bg-cream-100`(섹션 구분) `bg-forest-950`(다크 섹션/푸터)
- 브랜드: `forest-600`(주 액션) `forest-700/800`(호버/강조) `forest-900`(다크 텍스트 블록)
- 텍스트: `text-ink-900`(본문) `text-ink-600`(보조) `text-ink-400`(뮤트)
- 헤어라인: `border-ink-200` — 굵은 보더 금지, 항상 1px
- VIP 전용 골드: `brass-300/500/700` — **VIP 화면 밖에서 사용 금지**
- 경고/에러: `signal-red`, `signal-amber`
- **금지: 보라색, 파스텔 무지개, 그라데이션 남발, 순수 white/black (#fff/#000 대신 cream-50/ink-900)**

### 타이포그래피
- 본문/UI: Pretendard Variable (기본 font-sans, 이미 로드됨)
- 디스플레이 제목: `headline-serif` 유틸리티 (Noto Serif KR) — 홈 히어로, 섹션 타이틀, 상품 상세 제목, VIP 인사말
- 오버라인 라벨: `label-caps` 유틸리티 (11px, letter-spacing 0.22em, uppercase) — 예: `FERMENTED KONJAC`, `SINCE 2019`
- 가격: `krw` 유틸리티 (tabular numbers) + `krw()` 포맷터 사용, 원화는 `12,900원` 형식
- 한글 제목엔 `word-break: keep-all` (headline-serif에 포함됨)

### 레이아웃 & 모션
- 컨테이너: `container-hall` (max-w-96rem + 반응형 gutter). 화면을 광활하게 쓴다 — 좁은 카드 나열 금지
- 섹션 리듬: py-20~32 수준의 넉넉한 수직 여백, 섹션 사이 `hairline-t` 구분
- 스크롤 리빌: `.reveal` / `.reveal-clip` 클래스 + `--reveal-delay` CSS 변수 (Reveal 컴포넌트 사용)
- 이미지 호버: `.showcase-img` (부드러운 1.045 스케일)
- 부드러운 스크롤: Lenis (SmoothScroll 컴포넌트가 (shop) 레이아웃에 이미 적용)
- 이징: `ease-hall`, `ease-silk` 토큰 사용. duration은 0.5s~1.2s의 여유로운 템포
- 라운딩: 카드/이미지 rounded-none~rounded-sm (백화점 감성 = 각), 버튼/입력 rounded-none 또는 rounded-full(태그/뱃지만)
- 그림자 최소화 — 깊이는 헤어라인과 배경톤 차이로 표현

### 아이콘/장식 규칙 (매우 중요)
- **이모지 사용 절대 금지. 아이콘 남발 금지.**
- lucide-react는 장바구니/검색/사용자/메뉴/닫기/화살표 등 기능적 최소한만, `strokeWidth={1.5}`, 크기 18~20px
- 장식은 아이콘 대신: 헤어라인, 오버라인 라벨, 세리프 숫자(01/02/03), 여백

### 반응형
- 모바일 퍼스트로 완벽하게. 브레이크포인트: sm/md/lg/xl 표준
- 모바일: 헤더는 간결한 햄버거 + 풀스크린 오버레이 메뉴, 하단 고정 CTA(상품상세)
- 그리드: 상품 목록 모바일 2열 / md 3열 / xl 4열, gap은 x-3~4 y-10 (세로로 여유)

## 2. 기술 컨벤션

- Next.js 16 App Router + TS + Tailwind v4. 경로 별칭 `@/*` → `src/*`
- **서버 컴포넌트 기본**, 인터랙션 필요할 때만 `"use client"`
- 데이터 조회: 서버 컴포넌트에서 `createClient()` (`@/lib/supabase/server`) — RLS 적용됨 (active 상품만 보임)
- 관리자/결제/VIP 가격 등 민감 로직: API 라우트에서 `requireAdmin()`/`requireUser()` (`@/lib/auth`) 후 service client
- 클라이언트 상태: 장바구니는 `useCart` (`@/store/cart`), 나머지는 로컬 state
- 타입: `@/lib/types` 의 도메인 타입 사용 (Product, Order, VipCampaign 등 전부 정의됨)
- 포맷: `@/lib/format` (krw, formatDate, formatDateTime, formatPhone, discountRate)
- 상수: `@/lib/constants` (ORDER_STATUS_LABELS, CARRIERS, COMPANY, STORAGE_TYPE_LABELS 등)
- VIP 가격 해석: `@/lib/pricing` (resolveVipContext, resolvePrices) — 서버 전용
- 배송비: `@/lib/shipping` (getShippingSettings, calcShippingFee)
- 토스 결제: `@/lib/toss` (confirmPayment, cancelPayment, getPayment)
- 이미지: `next/image` 필수, supabase storage public URL. `sizes` 속성 지정
- 에러 처리: API는 `{ error: string }` + 적절한 status. 클라이언트는 사용자 친화적 한국어 메시지
- 주석/카피: 모두 자연스러운 한국어. 어색한 번역투 금지

## 3. 데이터 모델 요약 (Supabase, 이미 마이그레이션 완료)

- `categories` (slug, name, sort_order) / `products` (slug, price, compare_at_price, stock, status: draft|active|sold_out|hidden, storage_type, badges[], nutrition{}, specs{}, story) / `product_images` / `product_variants`
- `orders` (order_no 자동생성 DLyymmdd#####, status: pending→paid→preparing→shipped→delivered→confirmed, cancelled/refund_*, orderer{}, recipient{}, subtotal/discount_total/shipping_fee/total, vip_campaign_id, vip_code, coupon_id) / `order_items` (name_snapshot, unit_price, original_price, qty) / `payments` (payment_key, status) / `shipments` (carrier_code, tracking_no, status)
- VIP: `vip_groups`(discount_rate) / `vip_members`(user_id unique) / `vip_product_prices`(group_id 또는 user_id + custom_price 또는 discount_rate) / `vip_access_codes`(code, group_id, max_uses, expires_at) / `vip_campaigns`(token, title, message, group_id?, target_user_id?, require_code?, expires_at) / `vip_campaign_items`(product_id, custom_price)
- 마케팅: `coupons` / `coupon_redemptions` / `banners`(placement: hero|strip|mid) / `popups` / `notices`
- 고객: `profiles`(role: customer|admin) / `addresses` / `wishlists` / `reviews`(rating, admin_reply) / `product_inquiries`
- 운영: `inventory_logs`(delta, reason) / `analytics_events` / `settings`(key-value: shipping 등)
- RPC: `adjust_stock(p_product_id, p_variant_id, p_delta, p_reason, p_ref_order_id, p_memo)` — 재고 증감+로그 원자 처리, 부족 시 예외
- Storage 버킷(public): `products`, `banners`, `reviews`

## 4. 라우트 맵

### 스토어프론트 `src/app/(shop)/`  ← 그룹 레이아웃: Header + Footer + SmoothScroll
- `/` 홈, `/products` 전체 상품(카테고리/정렬 쿼리), `/products/[slug]` 상세, `/search`
- `/cart`, `/checkout`, `/checkout/success`, `/checkout/fail`
- `/login`, `/signup`, `/auth/callback` (route handler)
- `/mypage` + `/mypage/orders` `/mypage/orders/[id]` `/mypage/addresses` `/mypage/wishlist` `/mypage/reviews` `/mypage/profile`
- `/vip` (코드 입장) `/vip/shop` (VIP 상품관) `/vip/s/[token]` (시크릿 캠페인 페이지)
- `/about` (브랜드 스토리), `/support` (공지+FAQ+CS안내)

### 관리자 `src/app/admin/` ← AdminShell 레이아웃 (스토어와 별개, 미들웨어가 role 가드)
- `/admin` 대시보드, `/admin/products`(+`/new`, `/[id]`), `/admin/categories`, `/admin/inventory`
- `/admin/orders`(+`/[id]`), `/admin/customers`(+`/[id]`), `/admin/vip`, `/admin/vip/campaigns`(+`/new`, `/[id]`)
- `/admin/coupons`, `/admin/reviews`, `/admin/content`(배너/팝업/공지 탭), `/admin/analytics`, `/admin/settings`

### API `src/app/api/`
- `analytics/track` POST (익명 insert)
- `orders` POST (주문 생성 — **서버에서 가격/재고/배송비 전면 재검증**, VIP 컨텍스트 반영)
- `payments/confirm` POST (토스 승인 + 주문 paid 전환 + 재고 차감 adjust_stock + 금액 불일치 시 자동취소)
- `payments/webhook` POST (토스 웹훅 — 멱등 처리)
- `orders/[id]/cancel` POST (결제 취소 → 환불 + 재고 복구)
- `vip/verify-code` POST (코드 검증 → httpOnly 쿠키 `daleum_vip_code` 설정)
- `admin/**` — 전부 requireAdmin() 필수: products(CRUD+이미지 업로드), categories, inventory, orders(상태/운송장/메모/excel), customers, vip(groups/members/codes/prices/campaigns), coupons, reviews(숨김/답글), content(banners/popups/notices), analytics(집계), settings

## 5. 결제 플로우 (토스페이먼츠 결제위젯)

1. `/checkout`: 클라이언트가 `POST /api/orders` → 서버가 가격 재검증 후 pending 주문 생성, `{orderId, orderNo, amount}` 반환
2. 토스 위젯 `requestPayment({ orderId: orderNo, amount, successUrl: /checkout/success, failUrl: /checkout/fail })`
3. `/checkout/success?paymentKey&orderId&amount`: 서버 액션/route로 `POST /api/payments/confirm` → 토스 승인 API → 금액 대조(불일치 시 토스 취소 + 주문 실패) → orders.paid + payments 기록 + adjust_stock 차감 + 장바구니 클리어
4. 취소: 관리자/고객 취소 API → 토스 cancel → 주문 cancelled/refunded + 재고 복구
5. 환경변수: `NEXT_PUBLIC_TOSS_CLIENT_KEY`, `TOSS_SECRET_KEY` (현재 샌드박스 키)

## 6. VIP 시스템 규칙

- 가격 우선순위: 개별 지정가 > 그룹 상품 지정가 > 그룹 할인율 > 정가 (`resolvePrices`가 처리)
- `/vip`: 코드 입력 화면(브라스 골드 톤의 격조있는 UI) → `POST /api/vip/verify-code` → httpOnly 쿠키 → `/vip/shop`
- `/vip/shop`: 쿠키/멤버십 기반 VIP 가격으로 전 상품 표시 (정가 취소선 + VIP가)
- `/vip/s/[token]`: 캠페인 페이지 — 제목/인사말(세리프), 큐레이션 상품 + 캠페인 지정가. 만료/비활성 시 우아한 만료 안내. `require_code` 있으면 코드 입력 후 열람. view_count 증가
- VIP 화면은 forest-950 다크 배경 + brass 골드 액센트로 스토어와 차별화된 "프라이빗 살롱" 무드
- 주문 시 vip_campaign_id/vip_code가 주문에 기록되어 어떤 경로 판매인지 추적

## 7. 품질 기준

- `npm run build` 통과 (타입/린트 에러 0)
- 모든 페이지 모바일/데스크톱 완성도 동일
- 로딩/빈 상태/에러 상태 모두 디자인 (스켈레톤은 cream-100 펄스, 빈 상태는 세리프 문장 + 액션)
- 금액 계산은 서버가 진실의 원천 — 클라이언트 금액을 절대 신뢰하지 않는다
- 삭제 등 파괴적 액션은 확인 모달
