"use client";

/* ============================================================
   홈 대문 배너 입력 본체.

   여기서 고친 것 셋:
   1) 위치 선택칸에 있던 '띠 배너'·'중간 배너' 를 없앴다. 스토어프론트가 배너를
      읽는 유일한 지점(lib/cache.ts getCachedHeroBanners)이 placement='hero' 만
      조회하고, 'strip'/'mid'/'footer' 는 전 소스 어디에서도 렌더되지 않는다.
      즉 그 두 개로 만들면 활성으로 보이는데 고객 화면에는 아무것도 안 나왔다.
   2) 제목을 한 줄 입력에서 두 줄 입력으로 바꿨다. HomeHero.tsx:66 이
      title.split("\n") 으로 행을 나눠 조판하는데, 정작 관리자에는 줄바꿈을
      넣을 수단이 없어 기본 히어로만 두 줄로 예쁘고 직접 만든 배너는
      한 덩어리로 흘렀다.
   3) '텍스트 테마' 칸을 뺐다. 이 값을 읽는 고객 화면 코드가 하나도 없다
      (HomeHero 는 언제나 어두운 스크림 위 밝은 글자다). 아무 일도 하지 않는
      칸을 남겨 두면 관리자는 색을 바꿨다고 믿게 된다.

   그리고 미리보기를 HomeHero 의 실제 규칙에 맞췄다. 어긋나 있던 곳이 셋이다:
   4) 줄바꿈 — 미리보기는 늘 block 이라 언제나 줄이 나뉘었는데, HomeHero.tsx:117 은
      sm:block 이다. 가로 640px 미만(휴대폰)에서는 두 줄이 도로 한 줄로 이어진다.
      같은 클래스를 쓰고, 어절 사이 공백도 HomeHero 처럼 span **바깥**에 둔다
      (안에 두면 inline-block 꼬리 공백이 잘려 단어가 전부 붙어 보인다).
   5) 작은 설명 — 비워 두면 미리보기에는 아무것도 없었지만, 저장하면 빈 값은 null 이 되고
      (api/admin/content/lib.ts:149) HomeHero.tsx:68-70 의 물음표 두 개가 **기본 문구**를
      대신 내보낸다. "비워 두면 아무 말도 안 나간다" 고 믿고 저장하면 엉뚱한 문장이 홈에 걸린다.
   6) 버튼 — 링크를 비워도 버튼은 사라지지 않는다. HomeHero.tsx:71-72 가 '상품 보기' →
      /products 로 렌더한다. 미리보기에 버튼이 아예 없어 그 사실을 알 길이 없었다.
   ============================================================ */

import { Fragment } from "react";
import { FieldRow, Input, Select, Textarea, Toggle, Help } from "@/components/admin/Field";
import type { Banner } from "@/lib/types";
import { TOGGLE_LABELS } from "@/lib/admin-labels";
import PeriodField from "./PeriodField";
import LinkPicker from "./LinkPicker";
import RecommendedImageField from "./RecommendedImageField";
import type { LinkTargetsData } from "./link-targets";

/** 고객 화면에 실제로 렌더되는 자리 — 지금은 홈 대문 하나뿐이다 */
export const RENDERED_PLACEMENT: Banner["placement"] = "hero";

export const PLACEMENT_LABELS: Record<Banner["placement"], string> = {
  hero: "홈 대문",
  strip: "띠 배너",
  mid: "중간 배너",
  footer: "맨 아래",
};

export interface BannerFormState {
  title: string;
  subtitle: string;
  placement: Banner["placement"];
  image_url: string;
  link_url: string;
  starts_at: string;
  ends_at: string;
  is_active: boolean;
}

export const EMPTY_BANNER_FORM: BannerFormState = {
  title: "",
  subtitle: "",
  placement: RENDERED_PLACEMENT,
  image_url: "",
  link_url: "",
  starts_at: "",
  ends_at: "",
  is_active: true,
};

export interface BannerFormProps {
  form: BannerFormState;
  onChange: (next: BannerFormState) => void;
  targets: LinkTargetsData;
  targetsLoading: boolean;
}


/**
 * 배너가 비어 있을 때 HomeHero 가 대신 내보내는 값들.
 * 고객 화면(src/components/home/HomeHero.tsx:68-72)에서 그대로 옮겨 왔다 —
 * 그 파일은 이번 파도에서 수정 금지라 상수를 export 받을 수 없다.
 * **HomeHero 의 기본 문구가 바뀌면 여기도 함께 고쳐야 한다.**
 */
const HERO_DEFAULT_SUBTITLE =
  "국내 최초 효모·유산균 발효곤약. 매일의 식탁에 조용한 다름을 올립니다.";
const HERO_LINKED_BUTTON = "자세히 보기";
const HERO_UNLINKED_BUTTON = "상품 보기";

export default function BannerForm({ form, onChange, targets, targetsLoading }: BannerFormProps) {
  const lines = form.title.split("\n");
  const tooManyLines = lines.length > 3;
  // 저장하면 공백만 남은 설명도 null 이 되어 기본 문구가 나간다 — 미리보기도 같은 판정을 쓴다
  const usesDefaultSubtitle = form.subtitle.trim() === "";
  // 예전에 다른 자리로 만들어 둔 행 — 고르지는 못하게 하되 무엇인지는 보여 준다
  const legacyPlacement = form.placement !== RENDERED_PLACEMENT;

  return (
    <div className="divide-y divide-ink-100">
      <FieldRow
        label="큰 제목"
        required
        htmlFor="banner-title"
        help="엔터를 치면 줄이 나뉩니다. 두 줄이 가장 보기 좋습니다."
      >
        <Textarea
          id="banner-title"
          rows={2}
          value={form.title}
          onChange={(e) => onChange({ ...form, title: e.target.value })}
          placeholder={"곤약 그 이상의 한계를,\n발효로 완성하다"}
        />
        <div className="mt-2 bg-forest-950 px-4 py-3">
          <p className="text-[10px] tracking-[0.18em] text-cream-50/60">고객 화면에서 이렇게 보입니다</p>
          <p className="headline-serif mt-1.5 text-lg leading-snug text-cream-50">
            {lines.map((line, i) => (
              <Fragment key={i}>
                {/* HomeHero.tsx:117 과 같은 sm:block — 좁은 화면에서는 줄이 다시 이어진다.
                    어절 사이 공백은 span 바깥에 두어야 이어졌을 때 단어가 붙지 않는다 */}
                <span className="sm:block">{line || " "}</span>{" "}
              </Fragment>
            ))}
          </p>
          <p
            className={`mt-1.5 text-[11px] leading-relaxed ${
              usesDefaultSubtitle ? "text-cream-50/45" : "text-cream-50/75"
            }`}
          >
            {usesDefaultSubtitle ? HERO_DEFAULT_SUBTITLE : form.subtitle}
          </p>
          <span className="mt-2.5 inline-block bg-cream-50 px-3 py-1 text-[10px] tracking-[0.14em] text-ink-900">
            {form.link_url.trim() ? HERO_LINKED_BUTTON : HERO_UNLINKED_BUTTON}
          </span>
          {usesDefaultSubtitle && (
            <p className="mt-2 text-[10px] leading-relaxed text-cream-50/50">
              작은 설명을 비워 두어 흐린 글씨의 기본 문구가 그대로 나갑니다.
            </p>
          )}
        </div>
        <Help>
          가로 640px 미만(휴대폰)에서는 이 줄바꿈이 다시 한 줄로 이어집니다. 위 미리보기도 창을
          좁히면 똑같이 이어집니다.
        </Help>
        {tooManyLines && (
          <Help tone="error">줄이 {lines.length}개입니다. 세 줄을 넘으면 화면 아래가 잘립니다.</Help>
        )}
      </FieldRow>

      <FieldRow
        label="작은 설명"
        htmlFor="banner-subtitle"
        help="큰 제목 아래 한 줄로 붙습니다. 비워 두면 위 미리보기의 흐린 기본 문구가 대신 나갑니다."
      >
        <Input
          id="banner-subtitle"
          value={form.subtitle}
          onChange={(e) => onChange({ ...form, subtitle: e.target.value })}
          placeholder="국내 최초 효모·유산균 발효곤약"
        />
      </FieldRow>

      <FieldRow label="나오는 자리" htmlFor="banner-placement">
        <Select
          id="banner-placement"
          className="max-w-60"
          value={form.placement}
          onChange={(e) =>
            onChange({ ...form, placement: e.target.value as Banner["placement"] })
          }
        >
          <option value="hero">{PLACEMENT_LABELS.hero}</option>
          {legacyPlacement && (
            <option value={form.placement}>
              {PLACEMENT_LABELS[form.placement]} (지금은 고객 화면에 나오지 않습니다)
            </option>
          )}
        </Select>
        {legacyPlacement ? (
          <Help tone="error">
            이 자리는 고객 화면에 만들어져 있지 않아 아무것도 표시되지 않습니다. 홈 대문으로 바꿔
            저장하세요.
          </Help>
        ) : (
          <Help>홈 첫 화면을 가득 채우는 자리입니다. 지금 배너가 나가는 곳은 여기 하나입니다.</Help>
        )}
      </FieldRow>

      <FieldRow label="배경 사진" required>
        <RecommendedImageField
          value={form.image_url}
          onChange={(url) => onChange({ ...form, image_url: url })}
          prefix="banners"
          frameRatio={16 / 9}
          recommendText="가로 2000 × 세로 1125 (16:9 가로형), 글자가 잘 읽히도록 어두운 톤"
          frameNote="홈 첫 화면을 가득 덮습니다. 옆 초록 테두리는 '대략 이렇게 잘립니다' 라는 뜻이고, 실제로 잘리는 정도는 보는 사람의 화면 크기에 따라 달라집니다 — 휴대폰에서는 좌우가 훨씬 많이 잘리니 중요한 것은 가운데에 두세요."
        />
        {!form.image_url && (
          <Help tone="error">사진이 없으면 이 배너는 고객 화면에 나가지 않습니다.</Help>
        )}
      </FieldRow>

      <FieldRow label="배너 안 버튼을 눌렀을 때 갈 곳">
        <LinkPicker
          value={form.link_url}
          onChange={(next) => onChange({ ...form, link_url: next })}
          targets={targets}
          loading={targetsLoading}
          noneLabel="기본값 (전체 상품으로 보냄)"
          noneHelp={`비워 두면 배너 안 버튼이 '${HERO_UNLINKED_BUTTON}' 로 나가고, 누르면 전체 상품 목록으로 갑니다.`}
        />
      </FieldRow>

      <FieldRow label="노출 기간">
        <PeriodField
          kind="배너"
          from={form.starts_at}
          to={form.ends_at}
          onChange={({ from, to }) => onChange({ ...form, starts_at: from, ends_at: to })}
        />
      </FieldRow>

      <FieldRow label={TOGGLE_LABELS.switch} help="여러 개를 켜 두어도 맨 위 하나만 홈에 나갑니다.">
        <Toggle
          checked={form.is_active}
          onChange={(v) => onChange({ ...form, is_active: v })}
          label={form.is_active ? TOGGLE_LABELS.on : TOGGLE_LABELS.off}
        />
      </FieldRow>
    </div>
  );
}
