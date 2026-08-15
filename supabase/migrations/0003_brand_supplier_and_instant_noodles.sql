-- ============================================================
-- 0003 — 브랜드/공급 라인 구분 + '바로먹는 곤약면' 카테고리
--
-- 배경: 다름은 제조사이면서 자체 상품과 OEM 납품 상품(수다락·곤약닷컴)을 함께 판다.
-- 기존 모델에는 브랜드도 공급 라인도 없어서 자사 상품과 납품처 상품이 구분되지 않았다.
--   brand    — 패키지에 인쇄된 소비자 대면 브랜드 (마틴조 / 바비지요 / 밥애쏙 / 칼로리시즌 …)
--   supplier — 내부 공급 라인 구분 (자체 / 수다락 / 곤약닷컴)
-- brand 는 상품 상세페이지에 표기하고, supplier 는 관리자 식별용이다.
-- ============================================================

alter table daleum.products add column if not exists brand text;
alter table daleum.products add column if not exists supplier text;

comment on column daleum.products.brand is '패키지 인쇄 소비자 브랜드 — 상품 상세페이지 표기용';
comment on column daleum.products.supplier is '공급 라인: 자체 / 수다락 / 곤약닷컴 — 관리자 식별용';

create index if not exists idx_products_supplier on daleum.products(supplier);

-- 우동·모밀·냉면인데 곤약은 라면이 아니라 즉석 곤약면이라 'ramen'(곤약 라면)에 두면 분류가 어긋난다.
-- 기존 'noodles'(세면·국시·분모자 = 건면류)와도 성격이 달라 별도 카테고리로 분리한다.
insert into daleum.categories (slug, name, description, sort_order, is_active)
values (
  'instant-noodles',
  '바로먹는 곤약면',
  '데우기만 하면 되는 즉석 곤약면 — 우동·모밀·냉면',
  3,
  true
)
on conflict (slug) do update
  set name = excluded.name,
      description = excluded.description,
      sort_order = excluded.sort_order,
      is_active = true;

-- 기존 카테고리 정렬 재배치 (바로먹는 곤약면이 3번에 들어오므로 뒤로 밀어준다)
update daleum.categories set sort_order = 4 where slug = 'rice';
update daleum.categories set sort_order = 5 where slug = 'bulk';
