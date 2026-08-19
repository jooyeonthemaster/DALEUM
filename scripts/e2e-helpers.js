/**
 * 브라우저 검증용 공용 동작 — Playwright 의 evaluate 가 아니라 **드라이버 쪽**에서 쓴다.
 *
 *   const H = require('./scripts/e2e-helpers.js');
 *   await H.login(page); await H.openDetailTab(page, productId);
 *
 * 왜 파일로 빼는가: 관리자 화면은 세션이 자주 끊긴다. 로그인 절차를 검증할 때마다
 * 손으로 다시 조립하면 그 자체가 오류원이 된다(실제로 검증 도중 두 번 끊겼다).
 */
/* 자격증명은 **소스에 적지 않는다.** 검증용 관리자 계정을 운영 DB에 만들면
   그 비밀번호가 저장소에 남아 실제 관리자 권한이 새어 나간다(실제로 한 번 그럴 뻔했다 —
   검증이 끝난 뒤 계정을 지웠다). 필요할 때 환경변수로 넘겨라:
     DALEUM_E2E_EMAIL=... DALEUM_E2E_PASSWORD=... node <검증 스크립트> */
const BASE = process.env.DALEUM_BASE || 'http://localhost:3210';
const EMAIL = process.env.DALEUM_E2E_EMAIL;
const PASSWORD = process.env.DALEUM_E2E_PASSWORD;

/** 이미 로그인돼 있으면 건너뛰고, 아니면 로그인한다 (멱등) */
async function login(page) {
  if (!EMAIL || !PASSWORD) {
    throw new Error(
      'DALEUM_E2E_EMAIL / DALEUM_E2E_PASSWORD 환경변수가 필요합니다. ' +
      '검증이 끝나면 그 계정을 반드시 지우세요.'
    );
  }
  await page.goto(`${BASE}/admin/products`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);
  if (!page.url().includes('/login')) return 'already';

  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('textbox', { name: '이메일' }).fill(EMAIL);
  await page.getByRole('textbox', { name: '비밀번호' }).fill(PASSWORD);
  await Promise.all([
    page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 25000 }).catch(() => {}),
    page.getByRole('button', { name: '로그인' }).click(),
  ]);
  await page.waitForTimeout(1200);
  return 'logged-in';
}

/** 상품 편집 화면의 상세 탭까지 연다. 편집기 스테이지가 뜰 때까지 기다린다. */
async function openDetailTab(page, productId, { timeout = 60000 } = {}) {
  await page.goto(`${BASE}/admin/products/${productId}`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('tab', { name: /상세/ }).click({ timeout });
  await page.waitForSelector('[data-parity="stage-content"]', { timeout });
  // TipTap 이 문서를 붙이고 이미지가 자리를 잡을 시간
  await page.waitForTimeout(1500);
}

/** 편집 캔버스 / 고객 화면의 렌더 폭을 같은 규칙으로 잰다 (scripts/parity-probe.js 와 같은 로직) */
async function measure(page) {
  return page.evaluate(() => {
    const round = (n) => Math.round(n * 100) / 100;
    const stage = document.querySelector('[data-parity="stage-content"]');
    if (stage) {
      const scale = Number(stage.getAttribute('data-parity-scale') || '1') || 1;
      const imgs = [...stage.querySelectorAll('img')].map((i) => ({
        alt: i.getAttribute('alt') || '',
        width: round(i.getBoundingClientRect().width / scale),
      }));
      return {
        kind: 'editor',
        viewport: window.innerWidth,
        scale,
        contentWidth: round(stage.getBoundingClientRect().width / scale),
        imageCount: imgs.length,
        firstImageWidth: imgs.length ? imgs[0].width : null,
      };
    }
    const detail = [...document.querySelectorAll('img')].filter((i) =>
      (i.getAttribute('alt') || '').includes('상세 이미지')
    );
    if (!detail.length) return { kind: 'customer', error: 'no detail images' };
    let col = detail[0].parentElement;
    let guard = 0;
    while (col && guard++ < 8) {
      if (col.getBoundingClientRect().width > detail[0].getBoundingClientRect().width + 1) break;
      col = col.parentElement;
    }
    return {
      kind: 'customer',
      viewport: window.innerWidth,
      scale: 1,
      contentWidth: col ? round(col.getBoundingClientRect().width) : null,
      imageCount: detail.length,
      firstImageWidth: round(detail[0].getBoundingClientRect().width),
    };
  });
}

module.exports = { BASE, EMAIL, PASSWORD, login, openDetailTab, measure };
