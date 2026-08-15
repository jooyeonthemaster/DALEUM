-- ============================================================
-- 0005 — 카테고리 택소노미 재편
--
-- 배경: 최초 시딩이 `ramen` 을 "면 + 스프/소스가 한 봉지에 든 제품" 버킷으로 쓰면서
--       이름만 '곤약 라면' 으로 붙였다. 그래서 매콤짜장·매콤비빔·메밀소바·잔치국수가
--       라면 탭에 들어갔다(오분류가 아니라 이름이 내용을 배신한 것). 또한 납품사
--       (화심영농조합법인) 자료의 폴더 묶음을 소비자 카테고리로 그대로 승격하면서,
--       곤약이 0% 인 '맛있는 저당 파로현미밥' 이 '곤약쌀·바로밥' 탭에 편입됐다.
--
-- 원칙: 분류축을 "포장 안에 물리적으로 무엇이 들어 있는가" 하나로 통일한다.
--       slug 는 한 건도 바꾸지 않는다 — 기존 링크·검색 색인이 그대로 살아 있어야 한다.
--       삭제도 0건이다(products.category_id 는 on delete set null 이라 고아가 생긴다).
--
-- 변경: 개명 4 / 신설 2 / 상품 이동 3 / slug 변경 0 / 삭제 0
-- 멱등: 여러 번 실행해도 안전 (upsert + 조건부 update)
-- ============================================================

begin;

-- ---------- 1) 신설 2개 ----------
-- sort_order 를 기존 값 뒤(6·7)에 가산한다. 그래야 sudarak_launch.mjs 와 0003 에
-- 하드코딩된 rice=4 · bulk=5 가 그대로 no-op 이 되어 두 지점을 손대지 않아도 된다.
-- 타일 이미지는 파일명이 아니라 실제 그림을 보고 골랐다. public/editorial 의
-- rice-bowl-wood.jpg 는 이름과 달리 '국수' 사진이고, rice-black-bowl.jpg 는
-- 당도계로 측정하는 QC 컷(523x394)이라 둘 다 카테고리 타일로 쓸 수 없다.
-- grain-rice 는 해당 상품 자신의 원재료 플랫레이(찰현미·현미·엠머밀파로 3종)를 쓴다.
insert into daleum.categories (slug, name, description, image_url, sort_order, is_active)
values
  ('konjac-rice', '곤약쌀', '조미 없는 쌀알 모양 곤약 원물',
   '/editorial/rice-table.jpg', 6, true),
  ('grain-rice', '저당 곡물밥', '곤약 없이 고대곡물·현미로 지은 즉석밥',
   'https://ezmmutjazqsikopltmnj.supabase.co/storage/v1/object/public/products/daleum/paro-brown-rice/gallery/2.webp',
   7, true)
on conflict (slug) do update set
  name        = excluded.name,
  description = excluded.description,
  image_url   = excluded.image_url,
  sort_order  = excluded.sort_order,
  is_active   = excluded.is_active;

-- ---------- 2) 개명 4개 ----------
-- 이름이 소속 상품 전부에 참이 되도록 좁히거나 넓힌다. description 에는 멤버를
-- 열거하지 않는다 — 상품이 들고 나면 아무 경고 없이 거짓이 되기 때문이다.
update daleum.categories set
  name        = '소스포함 곤약면',
  description = '면과 소스·스프가 한 봉지에 함께 들어 있음',
  image_url   = '/editorial/hero-ramen.jpg'
where slug = 'ramen';

update daleum.categories set
  name        = '곤약면 단품',
  description = '소스·스프 없이 면만 들어 있음',
  image_url   = '/editorial/somyeon-bowl.jpg'
where slug = 'noodles';

update daleum.categories set
  name        = '용기형 곤약면',
  description = '국물·소스까지 용기에 담긴 한 그릇 — 데워도, 차게도',
  image_url   = '/editorial/buckwheat-noodle.jpg'
where slug = 'instant-noodles';

-- '곤약쌀·바로밥' → '곤약밥': 원물 곤약쌀 2종과 곤약 0% 파로현미밥이 빠져나가므로
-- 잔류 5종(수다락 곤약밥 3 + 마틴조 바로밥 2) 전부에 참이 된다.
update daleum.categories set
  name        = '곤약밥',
  description = '데우면 바로 먹는 완조리 곤약밥',
  image_url   = '/editorial/yeoju-rice.jpg'
where slug = 'rice';

-- ---------- 3) bulk — description 만 갱신 ----------
-- name·slug·is_active(false) 는 건드리지 않는다. 0004 가 의도적으로 숨긴 탭이다.
update daleum.categories set
  description = '업소·B2B 전용 — 4kg 벌크와 발효곤약 페이스트 (견적 문의)'
where slug = 'bulk';

-- ---------- 4) 상품 이동 3건 ----------
-- (a) 원물 곤약쌀 2종 → konjac-rice
--     밥에 섞어 짓거나 볶아 쓰는 재료다. 조리방법·식품유형 키가 없고 조미가 동봉되지
--     않는다. 데워 먹는 완제품 밥과 소비자 행동이 정반대다.
update daleum.products
   set category_id = (select id from daleum.categories where slug = 'konjac-rice')
 where slug in ('ssalgonyak', 'rice-12kcal');

-- (b) 맛있는 저당 파로현미밥 → grain-rice
--     법정 원재료가 현미 77% · 엠머밀파로 15.4% · 찰현미 7.6% 로 곤약이 0 이다.
--     상품 카피에는 곤약 주장이 없다 — 곤약을 주장하는 유일한 주체가 카테고리 라벨이었다.
--     상품 카드는 브랜드 없이 카테고리명만 단독 출력하므로(ProductCard.tsx) 곤약을
--     이름에 담은 어떤 탭에도 둘 수 없다.
update daleum.products
   set category_id = (select id from daleum.categories where slug = 'grain-rice')
 where slug = 'paro-brown-rice';

commit;

-- ---------- 검증 ----------
-- 카테고리 7개 / 노출 6개, 카테고리 미지정(NULL) 상품 0건이어야 한다.
select c.sort_order,
       c.slug,
       c.name,
       c.is_active,
       count(p.id) filter (where p.status in ('active', 'sold_out')) as 노출상품,
       count(p.id)                                                   as 전체상품
  from daleum.categories c
  left join daleum.products p on p.category_id = c.id
 group by c.id, c.sort_order, c.slug, c.name, c.is_active
 order by c.sort_order;

select count(*) as 카테고리_미지정_상품
  from daleum.products
 where category_id is null;
