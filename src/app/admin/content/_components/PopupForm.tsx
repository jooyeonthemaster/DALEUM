"use client";

/* ============================================================
   홈 팝업 입력 본체.

   고객 화면(components/home/PopupDisplay.tsx)이 실제로 하는 일을 그대로 알려 준다:
   · 사진은 4:3 으로 **강제로 잘라서** 보여 준다(aspect-[4/3] object-cover).
     그래서 흔한 세로형 홍보 이미지를 올리면 문구가 통째로 잘려 나간다.
   · 본문은 서식 없는 글이고 줄바꿈만 살아난다(whitespace-pre-line).
   · 이동 주소는 예전에 자유 입력이었다 — 오타가 나도 저장은 성공하고 고객만 막혔다.
   ============================================================ */

import { FieldRow, Input, Select, Textarea, Toggle, Help } from "@/components/admin/Field";
import type { Popup } from "@/lib/types";
import { TOGGLE_LABELS } from "@/lib/admin-labels";
import PeriodField from "./PeriodField";
import LinkPicker from "./LinkPicker";
import RecommendedImageField from "./RecommendedImageField";
import type { LinkTargetsData } from "./link-targets";

export const POSITION_LABELS: Record<Popup["position"], string> = {
  center: "화면 가운데",
  "bottom-left": "왼쪽 아래 구석",
  bottom: "화면 아래쪽",
};

export interface PopupFormState {
  title: string;
  image_url: string;
  content: string;
  link_url: string;
  position: Popup["position"];
  starts_at: string;
  ends_at: string;
  is_active: boolean;
}

export const EMPTY_POPUP_FORM: PopupFormState = {
  title: "",
  image_url: "",
  content: "",
  link_url: "",
  position: "center",
  starts_at: "",
  ends_at: "",
  is_active: true,
};

export interface PopupFormProps {
  form: PopupFormState;
  onChange: (next: PopupFormState) => void;
  targets: LinkTargetsData;
  targetsLoading: boolean;
}

export default function PopupForm({ form, onChange, targets, targetsLoading }: PopupFormProps) {
  return (
    <div className="divide-y divide-ink-100">
      <FieldRow
        label="제목"
        required
        htmlFor="popup-title"
        help="팝업 상자 안에 큰 글씨로 들어갑니다."
      >
        <Input
          id="popup-title"
          value={form.title}
          onChange={(e) => onChange({ ...form, title: e.target.value })}
          placeholder="추석 배송 안내"
        />
      </FieldRow>

      <FieldRow label="사진">
        <RecommendedImageField
          value={form.image_url}
          onChange={(url) => onChange({ ...form, image_url: url })}
          prefix="popups"
          frameRatio={4 / 3}
          recommendText="가로 900 × 세로 675 (4:3 가로형)"
          frameNote="팝업 상자 위쪽에 4:3 으로 잘려 들어갑니다. 세로로 긴 사진은 위아래가 잘립니다."
        />
        <Help>사진 없이 글만으로도 팝업을 띄울 수 있습니다.</Help>
      </FieldRow>

      <FieldRow label="본문" htmlFor="popup-content">
        <Textarea
          id="popup-content"
          rows={4}
          value={form.content}
          onChange={(e) => onChange({ ...form, content: e.target.value })}
          placeholder={"9월 14일까지 주문하신 상품은\n연휴 전에 도착합니다."}
        />
        <div className="mt-2 border border-ink-200 bg-cream-50 px-4 py-3">
          <p className="text-[10px] tracking-[0.18em] text-ink-400">고객 화면에서 이렇게 보입니다</p>
          <p className="mt-1.5 text-sm text-ink-900">{form.title || "제목"}</p>
          <p className="mt-1.5 whitespace-pre-line text-[13px] leading-relaxed text-ink-600">
            {form.content || "본문을 입력하면 여기에 그대로 보입니다."}
          </p>
        </div>
        <Help>
          굵게·목록 같은 서식은 쓸 수 없습니다. 엔터로 줄만 나뉘고, 입력한 글자가 그대로 나갑니다.
        </Help>
      </FieldRow>

      <FieldRow label="눌렀을 때 갈 곳">
        <LinkPicker
          value={form.link_url}
          onChange={(next) => onChange({ ...form, link_url: next })}
          targets={targets}
          loading={targetsLoading}
        />
      </FieldRow>

      <FieldRow label="뜨는 자리" htmlFor="popup-position">
        <Select
          id="popup-position"
          className="max-w-60"
          value={form.position}
          onChange={(e) => onChange({ ...form, position: e.target.value as Popup["position"] })}
        >
          {(Object.keys(POSITION_LABELS) as Popup["position"][]).map((key) => (
            <option key={key} value={key}>
              {POSITION_LABELS[key]}
            </option>
          ))}
        </Select>
        <Help>가운데로 두면 화면을 어둡게 덮고, 나머지는 구석에 작게 뜹니다.</Help>
      </FieldRow>

      <FieldRow label="노출 기간">
        <PeriodField
          kind="팝업"
          from={form.starts_at}
          to={form.ends_at}
          onChange={({ from, to }) => onChange({ ...form, starts_at: from, ends_at: to })}
        />
      </FieldRow>

      <FieldRow
        label={TOGGLE_LABELS.switch}
        help="여러 개를 켜 두어도 홈에는 맨 위 하나만 뜹니다."
      >
        <Toggle
          checked={form.is_active}
          onChange={(v) => onChange({ ...form, is_active: v })}
          label={form.is_active ? TOGGLE_LABELS.on : TOGGLE_LABELS.off}
        />
      </FieldRow>
    </div>
  );
}
