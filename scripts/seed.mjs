/**
 * DALEUM 자사몰 시딩 스크립트
 *
 * 데이터 소스: daleum.net 크롤 + 회사 브로슈어 전사 + 스마트스토어 실판매가 (2026-07-03)
 * 실행: node scripts/seed.mjs
 * 멱등성: slug/code/key 기준 upsert — 재실행 안전
 *
 * 비밀키는 .env.local(SUPABASE_SERVICE_ROLE_KEY)에서 읽음 — 하드코딩 금지.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// ---------- env ----------
function loadEnv(file) {
  const env = {};
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return env;
}
const env = loadEnv(path.join(ROOT, '.env.local'));
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL || 'https://swieykjfdcsscmzcstuq.supabase.co';
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!SERVICE_KEY) throw new Error('.env.local에 SUPABASE_SERVICE_ROLE_KEY가 없습니다');

// site 프로젝트 공유 DB — DALEUM은 daleum 스키마 (public은 suhn 소유)
const db = createClient(SUPABASE_URL, SERVICE_KEY, {
  db: { schema: 'daleum' },
  auth: { persistSession: false, autoRefreshToken: false },
});

// ---------- 이미지 소스 디렉터리 (크롤/브로슈어 산출물 — 로컬에 있을 때만 업로드) ----------
const SCRATCH = 'C:/Users/jooye/AppData/Local/Temp/claude/c--Users-jooye-Desktop-2026project-DALEUM/1ae05434-f2ac-47a9-ac61-1d66ca741926/scratchpad';
const CRAWL_IMG = path.join(SCRATCH, 'crawl', 'images');
const PDF_ASSETS = path.join(SCRATCH, 'pdf', 'assets');

function crawlImg(name) { return path.join(CRAWL_IMG, name); }
/** 브로슈어 패키지샷: 파일명 p{페이지}_{순번}_{해시}.jpg — prefix로 찾기 */
function pdfAsset(prefix) {
  if (!existsSync(PDF_ASSETS)) return null;
  const f = readdirSync(PDF_ASSETS).find((n) => n.startsWith(prefix + '_'));
  return f ? path.join(PDF_ASSETS, f) : null;
}

// ---------- 공통 카피 (브로슈어 원문 재구성) ----------
const STORY_FERMENT =
  '기존 곤약은 수산화칼슘으로 인한 특유의 냄새와 서걱한 식감 탓에 "참으며 먹는" 다이어트 식품이었습니다. ' +
  '다름은 국내 최초로 효모·유산균을 활용한 발효 공정(특허 제10-2547189호, 제10-2537721호)으로 이 한계를 극복했습니다. ' +
  '발효 과정에서 생성되는 당류·유기산·무기질이 곤약 특유의 냄새를 저감하고(냄새측정기: 일반 곤약 55~78 vs 발효곤약 8~15, 아메리카노 13), ' +
  '숙성·발효로 반죽이 팽창하며 생긴 공기층이 쫄깃하면서도 부드러운 식감을 만듭니다. ' +
  '기공을 통해 소스 흡착이 좋아지고, 100도 물에 3~5분 삶아도 부드러운 식감이 유지됩니다.';

const ORIGIN = '국내산 (경기 고양)';

// ---------- 카테고리 ----------
// 분류축은 "포장 안에 물리적으로 무엇이 들어 있는가" 하나다 (0005 마이그레이션 참조).
// description 에 소속 상품을 열거하지 않는다 — 상품이 들고 나면 아무 경고 없이 거짓이 된다.
// is_active 는 여기서 지정하지 않는다: bulk 는 0004 가 의도적으로 숨겼고, 시딩이
// 그것을 덮어쓰면 감춘 탭이 되살아난다.
const CATEGORIES = [
  { slug: 'ramen', name: '소스포함 곤약면', sort_order: 1, description: '면과 소스·스프가 한 봉지에 함께 들어 있음', image_url: '/editorial/hero-ramen.jpg' },
  { slug: 'noodles', name: '곤약면 단품', sort_order: 2, description: '소스·스프 없이 면만 들어 있음', image_url: '/editorial/somyeon-bowl.jpg' },
  { slug: 'instant-noodles', name: '용기형 곤약면', sort_order: 3, description: '국물·소스까지 용기에 담긴 한 그릇 — 데워도, 차게도', image_url: '/editorial/buckwheat-noodle.jpg' },
  { slug: 'rice', name: '곤약밥', sort_order: 4, description: '데우면 바로 먹는 완조리 곤약밥', image_url: '/editorial/yeoju-rice.jpg' },
  { slug: 'bulk', name: '대용량·업소용', sort_order: 5, description: '업소·B2B 전용 — 4kg 벌크와 발효곤약 페이스트 (견적 문의)' },
  { slug: 'konjac-rice', name: '곤약쌀', sort_order: 6, description: '조미 없는 쌀알 모양 곤약 원물', image_url: '/editorial/rice-table.jpg' },
  { slug: 'grain-rice', name: '저당 곡물밥', sort_order: 7, description: '곤약 없이 고대곡물·현미로 지은 즉석밥', image_url: 'https://ezmmutjazqsikopltmnj.supabase.co/storage/v1/object/public/products/daleum/paro-brown-rice/gallery/2.webp' },
];

// ---------- B2C 상품 13종 ----------
const B2C = [
  {
    slug: 'ramen-spicy', category: 'ramen', price: 117000, sort_order: 1,
    name: '마틴조 발효곤약라면 매운맛',
    subtitle: '한 봉지 59kcal — 특허 발효공법으로 만든 저칼로리 곤약라면',
    description:
      '특허 발효공법으로 만든 저칼로리 발효곤약면 라면(매운맛)입니다.\n\n' +
      '- 구성: 대두단백곤약면 200g + 스파이시분말스프 12g + 야채고명 2g (총 214g)\n' +
      '- 1회 제공량 기준 59kcal · 단백질 13% · 식이섬유 28%\n' +
      '- 일반 라면(500kcal)·짬뽕(464kcal) 대비 칼로리 약 7배, 탄수화물 약 6배, 나트륨 약 1.5배 낮음\n' +
      '- 마틴조 제품 공통: 無당 無지방',
    story: STORY_FERMENT + ' 끓여도 질겨지지 않는 발효곤약면이라, 뜨거운 매운 국물 라면으로 즐길 수 있습니다.',
    nutrition: { '칼로리': '59 kcal', '단백질': '13%', '식이섬유': '28%' },
    specs: { '구성': '대두단백곤약면 200g + 스파이시분말스프 12g + 야채고명 2g', '중량': '214g', '곤약분말 함량': '묵류(대두단백곤약면)내 곤약분말 2.8%' },
    weight: '214g', badges: ['BEST'], is_featured: true,
    tags: ['발효곤약', '저칼로리', '無당無지방'],
    images: [crawlImg('1-a.jpg'), crawlImg('a.jpg')],
  },
  {
    slug: 'ramen-kimchi', category: 'ramen', price: 126000, sort_order: 2,
    name: '마틴조 발효곤약라면 김치맛',
    subtitle: '국내산 김치블럭을 담은 60kcal 발효곤약 라면',
    description:
      '특허 발효공법으로 만든 저칼로리 발효곤약면 라면(김치맛)입니다.\n\n' +
      '- 구성: 대두단백곤약면 180g + 분말스프 12g + 김치블럭 4g (총 196g)\n' +
      '- 1회 제공량 기준 60kcal · 식이섬유 28%\n' +
      '- 국내산 김치 사용\n' +
      '- 마틴조 제품 공통: 無당 無지방',
    story: STORY_FERMENT + ' 국내산 김치블럭을 더해 얼큰하고 개운한 김치라면으로 완성했습니다.',
    nutrition: { '칼로리': '60 kcal', '식이섬유': '28%' },
    specs: { '구성': '대두단백곤약면 180g + 분말스프 12g + 김치블럭 4g', '중량': '196g', '특징': '국내산 김치 사용' },
    weight: '196g', badges: ['NEW'], is_featured: false,
    tags: ['발효곤약', '저칼로리', '김치'],
    images: [crawlImg('1-b.jpg'), crawlImg('b.jpg')],
  },
  {
    slug: 'jjajang', category: 'ramen', price: 120000, sort_order: 3,
    name: '마틴조 발효곤약 매콤짜장',
    subtitle: '소스까지 다 먹어도 85kcal — 저당! 저지방! 매콤짜장',
    description:
      '발효곤약면으로 만든 매콤짜장 비빔면입니다.\n\n' +
      '- 구성: 대두단백곤약면 200g + 분말스프 17g + 야채후레이크 2g (총 219g)\n' +
      '- 소스까지 다 먹어도 85kcal · 식이섬유 26% · 단백질 5g\n' +
      '- 저당! 저지방!',
    story: STORY_FERMENT + ' 발효 기공에 짜장 소스가 잘 배어들어, 계란 하나 올리면 "그냥 짜장 같다"는 후기가 나오는 메뉴입니다.',
    nutrition: { '칼로리': '85 kcal', '식이섬유': '26%', '단백질': '5 g' },
    specs: { '구성': '대두단백곤약면 200g + 분말스프 17g + 야채후레이크 2g', '중량': '219g' },
    weight: '219g', badges: [], is_featured: false,
    tags: ['발효곤약', '저칼로리', '비빔면'],
    images: [crawlImg('1-c.jpg'), crawlImg('c.jpg')],
  },
  {
    slug: 'bibim', category: 'ramen', price: 117000, sort_order: 4,
    name: '마틴조 발효곤약 매콤비빔',
    subtitle: '끓일 필요 없이 물 빼고 비비면 끝 — 130kcal 매콤비빔면',
    description:
      '발효곤약 세면으로 만든 매콤비빔면입니다.\n\n' +
      '- 구성: 발효곤약세면 200g + 매콤비빔소스 32g + 김스프 1g (총 233g)\n' +
      '- 1회 제공량 기준 130kcal · 나트륨 553mg · 단백질 15%\n' +
      '- 끓일 필요 없이 물 빼고 소스에 비비면 완성되는 간편 조리',
    story: STORY_FERMENT + ' 꼬들꼬들한 발효곤약 세면에 매콤비빔소스가 고르게 흡착되어, 딱 비빔면 맛을 냅니다.',
    nutrition: { '칼로리': '130 kcal', '나트륨': '553 mg', '단백질': '15%' },
    specs: { '구성': '발효곤약세면 200g + 매콤비빔소스 32g + 김스프 1g', '중량': '233g' },
    weight: '233g', badges: [], is_featured: false,
    tags: ['발효곤약', '저칼로리', '비빔면'],
    images: [crawlImg('1-d.jpg'), crawlImg('d.jpg')],
  },
  {
    slug: 'soba', category: 'ramen', price: 129000, sort_order: 5,
    name: '마틴조 발효곤약 메밀소바',
    subtitle: '볶은 메밀을 함유한 65kcal 발효곤약 메밀소바',
    description:
      '볶은 메밀을 함유한 발효곤약 메밀소바입니다.\n\n' +
      '- 구성: 발효곤약메밀면 200g + 액상소스 30g + 무블럭 2g\n' +
      '- 1회 제공량 기준 65kcal · 식이섬유 20%\n' +
      '- 국내산 무 사용\n' +
      '- 알레르기 유발물질: 메밀 함유',
    story: STORY_FERMENT + ' 볶은 메밀분말을 배합해 메밀면의 풍미를 살렸고, 차갑게 즐기는 소바로 잘 어울립니다.',
    nutrition: { '칼로리': '65 kcal', '식이섬유': '20%' },
    specs: { '구성': '발효곤약메밀면 200g + 액상소스 30g + 무블럭 2g', '특징': '국내산 무 사용', '알레르기': '메밀' },
    weight: null, badges: [], is_featured: false,
    tags: ['발효곤약', '저칼로리', '메밀'],
    images: [crawlImg('1-e.jpg'), crawlImg('e.jpg'), pdfAsset('p14_18')],
  },
  {
    slug: 'janchi', category: 'ramen', price: 129000, sort_order: 6,
    name: '마틴조 발효곤약 잔치국수',
    subtitle: '발효곤약면으로 말아낸 담백한 잔치국수',
    description:
      '발효곤약면으로 만든 잔치국수입니다.\n\n' +
      '- 특허 발효공법의 발효곤약면 사용\n' +
      '- 뜨거운 국물에도 질겨지지 않는 발효곤약면의 내열성 (100도 물 3~5분 조리 가능)',
    story: STORY_FERMENT + ' 내열성이 좋은 발효곤약면이라 잔치국수처럼 뜨거운 국물 요리로도 즐길 수 있습니다.',
    nutrition: {},
    specs: {},
    weight: null, badges: ['NEW'], is_featured: false,
    tags: ['발효곤약', '저칼로리', '국수'],
    images: [crawlImg('1-f.jpg'), crawlImg('f.jpg')],
  },
  {
    slug: 'semyeon', category: 'noodles', price: 54000, sort_order: 1,
    name: '마틴조 발효곤약 세면',
    subtitle: '1.4mm 가는 면 — 한 봉지 14kcal, 無당 無지방',
    description:
      '1.4mm 세면 형태의 발효곤약면입니다.\n\n' +
      '- 중량 200g · 면 굵기 1.4mm\n' +
      '- 한 봉지 14kcal · 식이섬유 12% (200g 기준)\n' +
      '- 트랜스지방·콜레스테롤 0% · 無당 無지방\n' +
      '- 발효곤약세면내 곤약분말 2.8%',
    story: STORY_FERMENT + ' 1.4mm 가는 면발이라 비빔·볶음·국물 요리 어디에나 부담 없이 어울립니다.',
    nutrition: { '칼로리': '14 kcal', '식이섬유': '12% (200g 기준)', '트랜스지방·콜레스테롤': '0%', '당류·지방': '無당 無지방' },
    specs: { '중량': '200g', '면 굵기': '1.4mm', '곤약분말 함량': '2.8%' },
    weight: '200g', badges: ['BEST'], is_featured: true,
    tags: ['발효곤약', '곤약면', '無당無지방'],
    images: [crawlImg('2-a.jpg'), crawlImg('a-2.jpg'), pdfAsset('p13_04'), pdfAsset('p12_01')],
  },
  {
    slug: 'guksi', category: 'noodles', price: 54000, sort_order: 2,
    name: '마틴조 발효곤약 국시',
    subtitle: '4mm 링귀네형 넓은 면 — 한 봉지 14kcal',
    description:
      '4mm 링귀네 형태의 발효곤약면입니다.\n\n' +
      '- 중량 200g · 면 너비 4mm (링귀네형)\n' +
      '- 한 봉지 14kcal · 식이섬유 14%\n' +
      '- 트랜스지방·콜레스테롤 0% · 無당 無지방\n' +
      '- 발효곤약국시내 곤약분말 2.8%',
    story: STORY_FERMENT + ' 납작하고 넓은 4mm 면발이 소스를 넉넉하게 머금어 칼국수·파스타 스타일에 잘 맞습니다.',
    nutrition: { '칼로리': '14 kcal', '식이섬유': '14%', '트랜스지방·콜레스테롤': '0%', '당류·지방': '無당 無지방' },
    specs: { '중량': '200g', '면 너비': '4mm (링귀네형)', '곤약분말 함량': '2.8%' },
    weight: '200g', badges: [], is_featured: false,
    tags: ['발효곤약', '곤약면', '無당無지방'],
    images: [crawlImg('2-b.jpg'), crawlImg('b-2.jpg'), pdfAsset('p13_05'), pdfAsset('p12_09')],
  },
  {
    slug: 'bunmoja', category: 'noodles', price: 54000, sort_order: 3,
    name: '마틴조 발효곤약 분모자누들',
    subtitle: '15mm 넓은 분모자 — 한 봉지 22kcal, 식이섬유 20%',
    description:
      '15mm 분모자(중국식 넓은 당면) 형태의 발효곤약입니다.\n\n' +
      '- 중량 200g · 면 너비 15mm\n' +
      '- 한 봉지 22kcal · 식이섬유 20% (200g 기준)\n' +
      '- 트랜스지방·콜레스테롤 0% · 無당 無지방\n' +
      '- 발효곤약분모자누들내 곤약분말 2.9%',
    story: STORY_FERMENT + ' 쫀득한 분모자 형태로 마라탕·떡볶이 같은 진한 소스 요리에 넣기 좋습니다.',
    nutrition: { '칼로리': '22 kcal', '식이섬유': '20% (200g 기준)', '트랜스지방·콜레스테롤': '0%', '당류·지방': '無당 無지방' },
    specs: { '중량': '200g', '면 너비': '15mm', '곤약분말 함량': '2.9%' },
    weight: '200g', badges: [], is_featured: false,
    tags: ['발효곤약', '곤약면', '분모자'],
    images: [crawlImg('2-c.jpg'), crawlImg('c-2.jpg'), pdfAsset('p13_06'), pdfAsset('p12_12')],
  },
  {
    slug: 'ssalgonyak', category: 'konjac-rice', price: 54000, sort_order: 1,
    name: '마틴조 발효쌀곤약',
    subtitle: '쌀알 모양 발효곤약 — 한 봉지 25kcal, 백미에 가까운 식감',
    description:
      '쌀알 모양의 발효곤약(곤약쌀)입니다.\n\n' +
      '- 중량 200g · 한 봉지 25kcal\n' +
      '- 당류/지방 0% — 無당 無지방\n' +
      '- 발효쌀곤약내 곤약분말 3.1%\n' +
      '- 발효 시 생성되는 이산화탄소로 쌀알 내 기공이 형성되어 볶음밥 소스 흡착이 우수',
    story: STORY_FERMENT + ' 효모 발효로 냄새를 잡고 기존 곤약보다 부드러워, 쌀밥에 한층 가까운 식감을 냅니다. 밥에 섞어 짓거나 볶음밥으로 즐겨보세요.',
    nutrition: { '칼로리': '25 kcal', '당류·지방': '0% (無당 無지방)' },
    specs: { '중량': '200g', '형태': '쌀알 모양', '곤약분말 함량': '3.1%' },
    weight: '200g', badges: [], is_featured: true,
    tags: ['발효곤약', '곤약쌀', '無당無지방'],
    images: [crawlImg('2-d.jpg'), crawlImg('d-2.jpg'), pdfAsset('p13_07'), pdfAsset('p12_02')],
  },
  {
    slug: 'rice-12kcal', category: 'konjac-rice', price: 54000, sort_order: 2,
    name: '마틴조 12kcal 발효곤약쌀',
    subtitle: '100g당 12kcal — 초저칼로리 발효곤약쌀',
    description:
      '100g당 12kcal의 초저칼로리 발효곤약쌀입니다.\n\n' +
      '- 100g당 12kcal\n' +
      '- 효모·유산균 발효 공정으로 곤약 특유의 냄새 저감',
    story: STORY_FERMENT + ' 곤약은 100g당 8~15kcal의 대표적인 로우푸드 — 체중조절, 식단관리에 쌀 대체식품으로 활용됩니다.',
    nutrition: { '칼로리': '12 kcal (100g당)' },
    specs: { '형태': '쌀알 모양' },
    weight: null, badges: [], is_featured: false,
    tags: ['발효곤약', '곤약쌀', '저칼로리'],
    images: [crawlImg('2-h.jpg'), crawlImg('h-2.jpg')],
  },
  {
    slug: 'baroban-oat', category: 'rice', price: 64000, sort_order: 3,
    name: '마틴조 발효곤약바로밥 귀리 병아리콩',
    subtitle: '알파발효곤약쌀 즉석밥 — 160kcal, 식이섬유 38%',
    description:
      '발효곤약쌀에 귀리·병아리콩을 더한 즉석밥입니다.\n\n' +
      '- 중량 150g · 알파발효곤약쌀 67.7%, 귀리 10.3% 등\n' +
      '- 160kcal · 탄수화물 11% · 식이섬유 38%\n' +
      '- 식후 혈당 상승 억제, 혈중 중성지질 개선, 배변활동에 도움',
    story: STORY_FERMENT + ' 냉동·전자레인지 조리에도 무너지지 않는 알파발효곤약쌀에 귀리와 병아리콩을 더해, 데우기만 하면 되는 저칼로리 한 끼로 만들었습니다.',
    nutrition: { '칼로리': '160 kcal', '탄수화물': '11%', '식이섬유': '38%' },
    specs: { '중량': '150g', '구성': '알파발효곤약쌀 67.7%, 귀리 10.3% 등' },
    weight: '150g', badges: [], is_featured: true,
    tags: ['발효곤약', '즉석밥', '바로밥'],
    images: [crawlImg('2-e.jpg'), crawlImg('e-2.jpg'), pdfAsset('p13_00'), pdfAsset('p13_01')],
  },
  {
    slug: 'baroban-brownrice', category: 'rice', price: 64000, sort_order: 4,
    name: '마틴조 발효곤약바로밥 현미 렌틸콩',
    subtitle: '알파발효곤약쌀 즉석밥 — 140kcal, 식이섬유 42%',
    description:
      '발효곤약쌀에 현미·렌틸콩을 더한 즉석밥입니다.\n\n' +
      '- 중량 150g · 알파발효곤약밥 68.7%, 현미 17.9% 등\n' +
      '- 140kcal · 탄수화물 10% · 식이섬유 42%\n' +
      '- 식후 혈당 상승 억제, 혈중 중성지질 개선, 배변활동에 도움',
    story: STORY_FERMENT + ' 구수한 현미와 렌틸콩을 더한 140kcal 즉석밥 — 식단관리 중에도 든든한 밥 한 공기를 챙길 수 있습니다.',
    nutrition: { '칼로리': '140 kcal', '탄수화물': '10%', '식이섬유': '42%' },
    specs: { '중량': '150g', '구성': '알파발효곤약밥 68.7%, 현미 17.9% 등' },
    weight: '150g', badges: [], is_featured: false,
    tags: ['발효곤약', '즉석밥', '바로밥'],
    images: [crawlImg('2-f.jpg'), crawlImg('f-2.jpg'), pdfAsset('p13_02'), pdfAsset('p13_03')],
  },
];

// ---------- B2B 상품 7종 (draft, price 0 — 관리자 가격 책정 후 공개) ----------
const BULK_COMMON = { '규격': '290*380*100mm', '합포장': '2入 / 530*210*175mm', '유통기한': '6개월', '보관': '실온보관' };
const B2B = [
  {
    slug: 'bulk-konjac-rice-shape', category: 'bulk', sort_order: 1,
    name: '곤약(쌀모양) 4kg 벌크',
    subtitle: '업소용 4kg — 쌀알과 동일한 쌀모양 기본 곤약',
    description:
      '곤약분말 3.1%와 수산화칼슘으로 생산되는 기본 곤약입니다.\n\n' +
      '- 등급 높은 곤약분말(중국)·수산화칼슘(일본) 사용으로 냄새 저감\n' +
      '- 레토르트 공정 시 이수율 25%\n' +
      '- 원형이 아닌 쌀알과 동일한 쌀모양 형태',
    story: null,
    nutrition: {},
    specs: { ...BULK_COMMON, '중량': '4,000g (총중량 6,500g)', '품목보고번호': '2021033667833', '원재료': '곤약분말 3.1%, 수산화칼슘' },
    weight: '4kg (총중량 6.5kg)',
    images: [crawlImg('2021033667833.jpg')],
  },
  {
    slug: 'bulk-fermented-rice-konjac', category: 'bulk', sort_order: 2,
    name: '발효쌀곤약 4kg 벌크',
    subtitle: '업소용 4kg — 발효공법으로 냄새·식감·소스흡착 개선',
    description:
      '발효공법으로 냄새·식감·소스흡착을 개선한 쌀모양 곤약입니다.\n\n' +
      '- 냄새테스트: 일반곤약 55~78 / 발효곤약 8~15 (아메리카노 13)\n' +
      '- 백미와 유사한 식감, 발효 시 생성되는 이산화탄소로 쌀알 내 기공 형성 — 볶음밥 제조 시 소스 흡착 우수\n' +
      '- 열강화 원료 배합으로 레토르트 공정 수율 85%\n' +
      '- 쌀알과 동일한 쌀모양 형태',
    story: null,
    nutrition: {},
    specs: { ...BULK_COMMON, '중량': '4,000g (총중량 6,500g)', '품목보고번호': '202103366782', '원재료': '곤약분말 3.1%, 조제감자전분, 찹쌀분말, 커드란, 수산화칼슘, 효모' },
    weight: '4kg (총중량 6.5kg)',
    images: [crawlImg('202103366782.jpg')],
  },
  {
    slug: 'bulk-alpha-konjac-rice', category: 'bulk', sort_order: 3,
    name: '알파발효곤약쌀 4kg 벌크 (HALAL)',
    subtitle: '업소용 4kg — 냉동유통 대응, 레토르트 수율 95%, HALAL 인증',
    description:
      '발효공법으로 냄새·식감·소스흡착을 개선한 냉동유통 대응 곤약쌀입니다.\n\n' +
      '- 열강화 원료 배합, 레토르트 공정 수율 95% (일반곤약 75%, 발효쌀곤약 85% 내외)\n' +
      '- 내한성 처리로 제품가공 후 냉동유통 가능 — 백미 50%+알파곤약쌀 50% 취반 후 냉동보관, 전자레인지 해동 시 이수현상 저감 (수율 92~98%)\n' +
      '- 쌀모양 형태\n' +
      '- HALAL 인증 (2023.08)',
    story: null,
    nutrition: {},
    specs: { ...BULK_COMMON, '중량': '4,000g (총중량 6,500g)', '품목보고번호': '2021033667845', '원재료': '곤약분말 3.1%, 수산화칼슘', '인증': 'HALAL' },
    weight: '4kg (총중량 6.5kg)',
    images: [crawlImg('2021033667845.jpg')],
  },
  {
    slug: 'bulk-konjac-noodle', category: 'bulk', sort_order: 4,
    name: '곤약면 4kg 벌크',
    subtitle: '업소용 4kg — 2mm 원형 노즐, 소면 대체',
    description:
      '열 가열, 레토르트 공정이 가능한 곤약면입니다.\n\n' +
      '- 찹쌀·감자전분 함유로 식감 개선\n' +
      '- 2mm 원형 노즐 사용 — 소면 대체',
    story: null,
    nutrition: {},
    specs: { ...BULK_COMMON, '중량': '4,000g (총중량 6,500g)', '품목보고번호': '2021033667819', '원재료': '곤약분말 3.1%, 찹쌀분말, 감자전분, 커드란, 수산화칼슘', '면 굵기': '2mm (원형)' },
    weight: '4kg (총중량 6.5kg)',
    images: [crawlImg('2021033667819.jpg')],
  },
  {
    slug: 'bulk-buckwheat-konjac-noodle', category: 'bulk', sort_order: 5,
    name: '메밀함유곤약면 4kg 벌크',
    subtitle: '업소용 4kg — 볶은 메밀분말 사용, 메밀면 대체',
    description:
      '열 가열, 레토르트 공정이 가능한 곤약면입니다.\n\n' +
      '- 찹쌀·감자전분 함유로 식감 개선\n' +
      '- 2mm 원형 노즐 — 소면 대체\n' +
      '- 볶은 메밀분말 사용 — 메밀면 대체',
    story: null,
    nutrition: {},
    specs: { ...BULK_COMMON, '중량': '4,000g (총중량 6,500g)', '품목보고번호': '2021033667820', '원재료': '곤약분말 3.1%, 찹쌀분말, 감자전분, 커드란, 수산화칼슘, 볶은메밀가루', '알레르기': '메밀', '면 굵기': '2mm (원형)' },
    weight: '4kg (총중량 6.5kg)',
    images: [crawlImg('2021033667820.jpg')],
  },
  {
    slug: 'bulk-fermented-konjac-noodle-ksb', category: 'bulk', sort_order: 6,
    name: '발효곤약면(KSB) 4kg 벌크',
    subtitle: '업소용 4kg — 특허 발효공법 곤약면',
    description:
      '특허받은 곤약 발효공법으로 냄새·식감·소스 흡착율을 개선한 곤약면입니다.\n\n' +
      '- 열가열·레토르트 공정 가능\n' +
      '- 찹쌀·감자전분 함유로 식감 개선\n' +
      '- 2mm 원형 노즐 — 소면 대체\n' +
      '- 볶은 메밀분말 사용 — 메밀면 대체',
    story: null,
    nutrition: {},
    specs: { ...BULK_COMMON, '중량': '4,000g (총중량 6,500g)', '품목보고번호': '2021033667885', '원재료': '곤약분말 3.1%, 찹쌀분말, 감자전분, 커드란, 수산화칼슘, 볶은메밀가루, 유산균', '알레르기': '메밀, 우유', '면 굵기': '2mm (원형)' },
    weight: '4kg (총중량 6.5kg)',
    images: [crawlImg('2021033667885.jpg')],
  },
  {
    slug: 'konjac-paste', category: 'bulk', sort_order: 7,
    name: '발효곤약 페이스트',
    subtitle: 'B2B 원료 — 육가공·떡·빵·어묵 등 식품 융합용',
    description:
      '발효곤약 페이스트 — 특허 제10-2547189호/제10-2537721호 "발효곤약페이스트를 이용한 제조방법" 기반의 B2B 원료입니다.\n\n' +
      '- 육가공, 떡, 빵, 어묵 등 식품 융합용\n' +
      '- 발효로 인한 연성이 좋아 육가공 재료와 결착이 우수 — 소시지, 햄버거 패티 등에 사용 가능하며 식감이 부드러움',
    story: null,
    nutrition: {},
    specs: { '용도': '육가공, 떡, 빵, 어묵 등 식품 융합용', '특허': '제10-2547189호, 제10-2537721호 (발효곤약페이스트를 이용한 제조방법)' },
    weight: null,
    images: [crawlImg('2-g.jpg'), crawlImg('g-2.jpg')],
  },
];

// ---------- helpers ----------
const log = (...a) => console.log(...a);
function fail(step, error) {
  console.error(`[FAIL] ${step}:`, error?.message || error);
  process.exitCode = 1;
  throw new Error(`${step} 실패`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  log('=== DALEUM 시딩 시작 ===');
  log('Supabase:', SUPABASE_URL);

  // 1) 카테고리 upsert
  // is_active 를 강제하지 않는다 — 예전엔 `{ ...c, is_active: true }` 로 덮어써서
  // 0004 가 숨긴 bulk 탭이 재시딩 때마다 되살아났다. 신규 행은 컬럼 기본값(true)이 붙는다.
  const { data: cats, error: catErr } = await db
    .from('categories')
    .upsert(CATEGORIES, { onConflict: 'slug' })
    .select('id, slug');
  if (catErr) fail('categories upsert', catErr);
  const catId = Object.fromEntries(cats.map((c) => [c.slug, c.id]));
  log(`[OK] categories: ${cats.length}개`);

  // 2) 상품 upsert (slug 기준)
  const productRows = [
    ...B2C.map((p) => ({
      slug: p.slug, name: p.name, subtitle: p.subtitle,
      category_id: catId[p.category],
      description: p.description, story: p.story,
      price: p.price, compare_at_price: null,
      stock: 100, status: 'active',
      storage_type: 'room', origin: ORIGIN, weight: p.weight,
      badges: p.badges, nutrition: p.nutrition, specs: p.specs,
      tags: p.tags, is_featured: p.is_featured, sort_order: p.sort_order,
    })),
    ...B2B.map((p) => ({
      slug: p.slug, name: p.name, subtitle: p.subtitle,
      category_id: catId[p.category],
      description: p.description, story: p.story,
      price: 0, compare_at_price: null,
      stock: 0, status: 'draft',
      storage_type: 'room', origin: ORIGIN, weight: p.weight,
      badges: [], nutrition: p.nutrition, specs: p.specs,
      tags: ['B2B'], is_featured: false, sort_order: p.sort_order,
    })),
  ];
  const { data: prods, error: prodErr } = await db
    .from('products')
    .upsert(productRows, { onConflict: 'slug' })
    .select('id, slug, name, price, status');
  if (prodErr) fail('products upsert', prodErr);
  const prodId = Object.fromEntries(prods.map((p) => [p.slug, p.id]));
  log(`[OK] products: ${prods.length}개 (active ${prods.filter((p) => p.status === 'active').length} / draft ${prods.filter((p) => p.status === 'draft').length})`);

  // 3) 이미지 업로드 → product_images
  const imageCounts = {};
  for (const p of [...B2C, ...B2B]) {
    const files = (p.images || []).filter((f) => f && existsSync(f));
    const missing = (p.images || []).filter((f) => !f || !existsSync(f));
    if (missing.length) console.warn(`[WARN] ${p.slug}: 이미지 ${missing.length}개 소스 파일 없음 — 건너뜀`);
    const rows = [];
    for (let i = 0; i < files.length; i++) {
      const storagePath = `daleum/${p.slug}/${i + 1}.jpg`; // 공유 버킷 — daleum/ 프리픽스 필수
      const buf = readFileSync(files[i]);
      const { error: upErr } = await db.storage.from('products').upload(storagePath, buf, {
        contentType: 'image/jpeg', upsert: true,
      });
      if (upErr) fail(`storage upload ${storagePath}`, upErr);
      const { data: pub } = db.storage.from('products').getPublicUrl(storagePath);
      rows.push({
        product_id: prodId[p.slug], url: pub.publicUrl,
        alt: `${p.name} 이미지 ${i + 1}`, sort_order: i, is_primary: i === 0,
      });
    }
    // 멱등: 기존 이미지 레코드 삭제 후 재삽입
    const { error: delErr } = await db.from('product_images').delete().eq('product_id', prodId[p.slug]);
    if (delErr) fail(`product_images delete ${p.slug}`, delErr);
    if (rows.length) {
      const { error: insErr } = await db.from('product_images').insert(rows);
      if (insErr) fail(`product_images insert ${p.slug}`, insErr);
    }
    imageCounts[p.slug] = rows.length;
    log(`[OK] images ${p.slug}: ${rows.length}장`);
  }

  // 4) 재고 이력 (active 상품 delta +100, 최초 1회만)
  let invInserted = 0;
  for (const p of B2C) {
    const { data: existing, error: exErr } = await db
      .from('inventory_logs').select('id').eq('product_id', prodId[p.slug]).eq('reason', 'initial').limit(1);
    if (exErr) fail('inventory_logs check', exErr);
    if (existing.length) continue;
    const { error: invErr } = await db.from('inventory_logs').insert({
      product_id: prodId[p.slug], delta: 100, reason: 'initial', memo: '초기 시딩',
    });
    if (invErr) fail('inventory_logs insert', invErr);
    invInserted++;
  }
  log(`[OK] inventory_logs: 신규 ${invInserted}건 (initial)`);

  // 5) VIP 데모
  let { data: group } = await db.from('vip_groups').select('id').eq('name', 'VIP 데모 그룹').maybeSingle();
  if (!group) {
    const { data: g, error: gErr } = await db.from('vip_groups').insert({
      name: 'VIP 데모 그룹', description: '테스트용 — 관리자에서 수정하세요', discount_rate: 10, is_active: true,
    }).select('id').single();
    if (gErr) fail('vip_groups insert', gErr);
    group = g;
  }
  const { error: codeErr } = await db.from('vip_access_codes').upsert({
    code: 'DALEUM10', group_id: group.id, label: '데모 코드', is_active: true,
  }, { onConflict: 'code' });
  if (codeErr) fail('vip_access_codes upsert', codeErr);

  let { data: campaign } = await db.from('vip_campaigns')
    .select('id, token').eq('title', '감사의 마음을 담은 프라이빗 셀렉션').maybeSingle();
  if (!campaign) {
    const token = randomBytes(9).toString('base64url'); // 12자 url-safe
    const { data: c, error: cErr } = await db.from('vip_campaigns').insert({
      token,
      title: '감사의 마음을 담은 프라이빗 셀렉션',
      message: '늘 다름을 아껴주시는 고객님께,\n발효곤약 대표 상품을 특별한 가격으로 준비했습니다.',
      group_id: group.id,
      is_active: true,
    }).select('id, token').single();
    if (cErr) fail('vip_campaigns insert', cErr);
    campaign = c;
  }
  const vipItems = ['ramen-spicy', 'semyeon', 'ssalgonyak'].map((slug, i) => {
    const price = productRows.find((r) => r.slug === slug).price;
    return {
      campaign_id: campaign.id,
      product_id: prodId[slug],
      custom_price: Math.floor((price * 0.85) / 100) * 100, // 정가 15% 할인, 100원 단위 내림
      sort_order: i,
    };
  });
  const { error: ciErr } = await db.from('vip_campaign_items').upsert(vipItems, { onConflict: 'campaign_id,product_id' });
  if (ciErr) fail('vip_campaign_items upsert', ciErr);
  log(`[OK] VIP: 그룹/코드(DALEUM10)/캠페인(token=${campaign.token}) + 아이템 ${vipItems.length}개`);

  // 6) 설정 (배송비)
  const { error: setErr } = await db.from('settings').upsert({
    key: 'shipping', value: { base_fee: 3500, free_threshold: 50000, island_extra: 3000 },
  }, { onConflict: 'key' });
  if (setErr) fail('settings upsert', setErr);
  log('[OK] settings.shipping: base 3500 / free 50000 / island +3000');

  // 7) 관리자 계정
  const ADMIN_EMAIL = 'admin@daleum.kr';
  let adminId = null;
  const { data: created, error: adminErr } = await db.auth.admin.createUser({
    email: ADMIN_EMAIL,
    password: 'Daleum#2026Admin',
    email_confirm: true,
    user_metadata: { name: '관리자' },
  });
  if (adminErr) {
    if (/already|exists|registered/i.test(adminErr.message)) {
      const { data: list, error: listErr } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
      if (listErr) fail('auth listUsers', listErr);
      adminId = list.users.find((u) => u.email === ADMIN_EMAIL)?.id ?? null;
      if (!adminId) fail('admin lookup', new Error('기존 관리자 유저를 찾지 못함'));
      log('[OK] admin: 기존 계정 재사용');
    } else fail('admin createUser', adminErr);
  } else {
    adminId = created.user.id;
    log('[OK] admin: 신규 생성');
    await sleep(1500); // profiles 트리거 대기
  }
  const { error: roleErr } = await db.from('profiles').upsert({
    id: adminId, email: ADMIN_EMAIL, name: '관리자', role: 'admin',
  }, { onConflict: 'id' });
  if (roleErr) fail('profiles role update', roleErr);
  log(`[OK] profiles: ${ADMIN_EMAIL} → role=admin`);

  // 8) 검증
  log('\n=== 검증 ===');
  const count = async (table, filter) => {
    let q = db.from(table).select('*', { count: 'exact', head: true });
    if (filter) q = filter(q);
    const { count: n, error } = await q;
    if (error) fail(`verify ${table}`, error);
    return n;
  };
  const nCat = await count('categories');
  const nActive = await count('products', (q) => q.eq('status', 'active'));
  const nDraft = await count('products', (q) => q.eq('status', 'draft'));
  const nImg = await count('product_images');
  const nInv = await count('inventory_logs', (q) => q.eq('reason', 'initial'));
  const nGroups = await count('vip_groups');
  const nCodes = await count('vip_access_codes');
  const nCamps = await count('vip_campaigns');
  const nCampItems = await count('vip_campaign_items');
  const { data: adminProfile } = await db.from('profiles').select('email, role').eq('id', adminId).single();

  log(`categories: ${nCat}`);
  log(`products: active ${nActive} / draft ${nDraft} (총 ${nActive + nDraft})`);
  log(`product_images: ${nImg}`);
  log(`inventory_logs(initial): ${nInv}`);
  log(`vip_groups: ${nGroups} / vip_access_codes: ${nCodes} / vip_campaigns: ${nCamps} / items: ${nCampItems}`);
  log(`admin: ${adminProfile?.email} (role=${adminProfile?.role})`);

  log('\n=== 상품 목록 ===');
  for (const p of prods.sort((a, b) => (a.status === b.status ? 0 : a.status === 'active' ? -1 : 1))) {
    log(`- [${p.status}] ${p.slug} | ${p.name} | ${p.price.toLocaleString()}원 | 이미지 ${imageCounts[p.slug] ?? 0}장`);
  }
  log(`\nVIP 코드: DALEUM10 (10%) / 캠페인: /vip/s/${campaign.token}`);
  log('=== 시딩 완료 ===');
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
