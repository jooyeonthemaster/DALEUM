# 다름 DALEUM 자사몰

발효곤약 브랜드 **다름(DALEUM)** 의 공식 자사몰. "조용한 럭셔리 프레시 홀" 컨셉의 프리미엄 커머스.

- **프로덕션**: https://daleum-mall.vercel.app (별칭: daleum-pied.vercel.app)
- **저장소**: https://github.com/jooyeonthemaster/DALEUM — main 푸시 시 Vercel 자동 배포

## 스택

- **Next.js 16** (App Router) · TypeScript · Tailwind CSS v4
- **Supabase** — DB(Postgres 17) / Auth / Storage (프로젝트: `swieykjfdcsscmzcstuq`, 서울 리전)
- **토스페이먼츠 결제위젯** — 현재 샌드박스 키 (실계약 후 `.env.local` 교체)
- zustand(장바구니) · lenis(스무스 스크롤) · framer-motion · recharts(관리자 차트) · xlsx(운송장 엑셀)

## 실행

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # 프로덕션 빌드
node scripts/seed.mjs   # 데이터 시딩 (멱등 — 재실행 안전)
```

환경변수는 `.env.example` 참고 (`.env.local` 필요).

## 주요 경로

| 경로 | 설명 |
|---|---|
| `/` | 홈 (에디토리얼 히어로/카테고리/베스트/발효 스토리) |
| `/products`, `/products/[slug]` | 상품 목록/상세 (리뷰·문의·영양정보) |
| `/cart` → `/checkout` | 장바구니 → 토스 결제위젯 결제 |
| `/mypage/*` | 주문내역·배송조회·배송지·위시리스트·리뷰 |
| `/vip` | VIP 초대 코드 입장 (데모 코드: `DALEUM10`) |
| `/vip/shop` | VIP 전용 우대가 상품관 |
| `/vip/s/[token]` | 시크릿 캠페인 페이지 (관리자가 생성해 링크 전달) |
| `/admin` | 관리자 (대시보드/상품/재고/주문/운송장/고객/VIP/쿠폰/콘텐츠/분석/설정) |

## 관리자

- 초기 계정: `admin@daleum.kr` / `Daleum#2026Admin` — **로그인 후 반드시 비밀번호 변경**
- 권한은 `profiles.role = 'admin'` 기준 (미들웨어 + 서버 `requireAdmin()` 이중 가드)

## VIP 가격 우선순위

캠페인 지정가 > 고객 개별 지정가 > 그룹 상품 지정가 > 그룹 할인율 > 정가
(`src/lib/pricing.ts` — 표시는 물론 **주문 생성 시 서버에서 재계산**)

## 운영 참고

- **가격 확인 필요**: 시딩 가격은 네이버 스마트스토어 크롤 기준으로, 박스(케이스) 단위 가격으로 추정됨. 관리자 → 상품 관리에서 판매 단위/단가 정리 필요.
- B2B 벌크 7종은 `임시 저장(draft)` 상태 — 가격 책정 후 공개.
- 주문 취소/환불은 반드시 관리자 주문 상세의 **환불 처리** 버튼 경유 (PG 취소와 DB 상태를 함께 처리).
- 운송장 등록 시 자동으로 배송중 처리 + 고객 조회 링크 제공. CJ대한통운 대량 등록용 엑셀 내보내기 지원.
- DB 스키마: `supabase/migrations/0001_init_schema.sql` · 설계 문서: `docs/AGENT_CONTEXT.md`
