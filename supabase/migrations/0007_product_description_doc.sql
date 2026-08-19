-- ============================================================
-- 0007 — 상세페이지 문서 모델 v2 저장소
--
-- 관리자 상세페이지 편집기가 "블로그처럼" 동작하려면 이미지 폭·정렬·본문 크기 같은
-- 서식을 담을 자리가 필요하다. 기존 products.description 은 줄 단위 마크다운이라
-- 그 자리가 없다.
--
-- 그래서 문서를 jsonb 로 따로 담는다. description 은 지우지 않고 **파생 미러**로 남긴다 —
-- 메타데이터(slice 160자)·b2b 페이지·상품 건강도·verify_catalog·일괄등록 시트가 전부
-- description 을 읽고 있어서, 미러를 유지하면 그 어느 것도 손대지 않아도 된다.
--
-- 고객 화면은 description_doc 이 있으면 v2 렌더러를, 없으면 기존 렌더러를 탄다.
-- 따라서 이 컬럼이 비어 있는 기존 27개 상품은 **코드 경로가 전혀 바뀌지 않는다**.
-- ============================================================

alter table daleum.products
  add column if not exists description_doc jsonb;

comment on column daleum.products.description_doc is
  '상세페이지 문서 v2 (lib/detail-doc-v2.ts). 진실. products.description 은 이것의 레거시 마크다운 미러이며 읽기 전용 폴백이다.';
