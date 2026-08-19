/**
 * 정합 프로브 — "편집 캔버스가 정말 고객 화면과 같은가"를 브라우저 안에서 잰다.
 *
 * node 로 돌리는 파일이 아니다. Playwright 의 evaluate 로 페이지에 주입해 쓴다:
 *   const src = fs.readFileSync('scripts/parity-probe.js','utf8');
 *   const profile = await page.evaluate(src + ';probe()');
 *
 * ── 왜 스크립트로 빼는가 ──
 * "확대되어 보인다"는 눈으로 판정할 수 없다. 이 프로젝트의 최초 결함은
 * 관리자 1066px vs 고객 766px 이었는데, 스크린샷만 봐서는 둘 다 그럴듯해 보였다.
 *
 * ── 왜 폭만으로는 부족한가 (실제로 놓친 결함) ──
 * 폭만 재는 1차 게이트는 통과했는데(766=766) 편집 캔버스의 글자가 16px/24px/ink-900,
 * 고객은 15px/29px/ink-600 이었다. 폭이 같아도 글자 크기가 다르면 **줄바꿈 위치가 달라져서**
 * "고객 화면 그대로"가 거짓이 된다. 그래서 타이포까지 함께 잰다.
 *
 * ── 모바일 실측 주의 ──
 * 데스크톱 브라우저는 스크롤바가 뷰포트를 10px 먹는다(innerWidth 390 인데 clientWidth 380).
 * 실제 휴대폰은 오버레이 스크롤바라 먹지 않는다. 고객 화면을 모바일 폭으로 잴 때는
 * 스크롤바를 없앤 뒤 재야 한다. 안 그러면 350 을 340 으로 잘못 읽는다(실제로 그랬다).
 */
function probe() {
  const round = (n) => Math.round(n * 100) / 100;

  /** 한 요소의 '보이는 방식'을 뽑는다 — 두 화면을 비교할 수 있는 최소 집합 */
  const styleOf = (el) => {
    if (!el) return null;
    const s = getComputedStyle(el);
    return {
      fontSize: s.fontSize,
      lineHeight: s.lineHeight,
      color: s.color,
      fontWeight: s.fontWeight,
      fontFamily: s.fontFamily.split(',')[0].replace(/["']/g, ''),
      paddingLeft: s.paddingLeft,
      textAlign: s.textAlign,
    };
  };

  const scan = (root, scale) => {
    const imgs = [...root.querySelectorAll('img')].map((i) => ({
      alt: i.getAttribute('alt') || '',
      width: round(i.getBoundingClientRect().width / scale),
    }));
    // 목록 마커('—')는 ::before 로 그려진다 — 없으면 고객 화면과 다르게 보인다
    const li = root.querySelector('li');
    const marker = li ? getComputedStyle(li, '::before').content : null;
    return {
      contentWidth: round(root.getBoundingClientRect().width / scale),
      imageCount: imgs.length,
      firstImageWidth: imgs.length ? imgs[0].width : null,
      paragraph: styleOf(root.querySelector('p')),
      listItem: styleOf(li),
      listMarker: marker,
      heading: styleOf(root.querySelector('h2,h3,h4')),
    };
  };

  /* ---------- 편집 캔버스 ---------- */
  const stage = document.querySelector('[data-parity="stage-content"]');
  if (stage) {
    // transform: scale 이 걸려 있으면 rect 는 축소된 값을 준다. 우리가 비교할 것은
    // "고객이 보는 CSS 픽셀" 이므로 축소를 되돌린 논리 폭으로 환산한다.
    const scale = Number(stage.getAttribute('data-parity-scale') || '1') || 1;
    return { kind: 'editor', viewport: document.documentElement.clientWidth, scale, ...scan(stage, scale) };
  }

  /* ---------- 고객 화면 ---------- */
  const detail = [...document.querySelectorAll('img')].filter((i) =>
    (i.getAttribute('alt') || '').includes('상세 이미지')
  );
  if (detail.length === 0) return { kind: 'customer', error: '상세 이미지를 찾지 못했다' };

  // 상세 섹션의 콘텐츠 칼럼 = max-w-3xl 컨테이너
  const col = detail[0].closest('.max-w-3xl') || detail[0].parentElement;
  return {
    kind: 'customer',
    viewport: document.documentElement.clientWidth,
    scale: 1,
    ...scan(col, 1),
  };
}

/**
 * 두 프로필을 비교해 어긋난 항목만 돌려준다.
 * 폭은 ±2px 을 허용하고(테두리 1px 등), 타이포는 정확히 같아야 한다.
 */
function compareProfiles(editor, customer, { widthTolerance = 2 } = {}) {
  const diffs = [];
  const num = (v) => parseFloat(String(v));

  if (Math.abs(editor.contentWidth - customer.contentWidth) > widthTolerance) {
    diffs.push({ field: 'contentWidth', editor: editor.contentWidth, customer: customer.contentWidth });
  }
  if (
    editor.firstImageWidth != null &&
    customer.firstImageWidth != null &&
    Math.abs(editor.firstImageWidth - customer.firstImageWidth) > widthTolerance
  ) {
    diffs.push({ field: 'imageWidth', editor: editor.firstImageWidth, customer: customer.firstImageWidth });
  }

  for (const group of ['paragraph', 'listItem', 'heading']) {
    const a = editor[group];
    const b = customer[group];
    if (!a || !b) continue;
    for (const key of ['fontSize', 'lineHeight', 'color', 'paddingLeft']) {
      const av = a[key];
      const bv = b[key];
      if (av === bv) continue;
      // line-height 는 소수점 반올림 차이를 1px 까지 봐준다
      if (key === 'lineHeight' && Math.abs(num(av) - num(bv)) <= 1) continue;
      diffs.push({ field: `${group}.${key}`, editor: av, customer: bv });
    }
  }

  if (editor.listMarker && customer.listMarker && editor.listMarker !== customer.listMarker) {
    diffs.push({ field: 'listMarker', editor: editor.listMarker, customer: customer.listMarker });
  }
  return diffs;
}
