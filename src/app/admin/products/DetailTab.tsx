"use client";

import { FieldRow, Textarea } from "@/components/admin/Field";
import KeyValueEditor from "./KeyValueEditor";
import type { FormState, KvRow } from "./form-types";

export interface DetailTabProps {
  form: FormState;
  set: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
  nutritionRows: KvRow[];
  setNutritionRows: (rows: KvRow[]) => void;
  specRows: KvRow[];
  setSpecRows: (rows: KvRow[]) => void;
}

/** 상세·영양 탭 — description / story / nutrition / specs */
export default function DetailTab({
  form,
  set,
  nutritionRows,
  setNutritionRows,
  specRows,
  setSpecRows,
}: DetailTabProps) {
  return (
    <div className="divide-y divide-ink-100">
      <FieldRow
        label="상세 설명"
        htmlFor="p-description"
        help="마크다운 문법을 지원합니다. 예: **굵게**, - 목록, ## 소제목"
      >
        <Textarea
          id="p-description"
          rows={10}
          value={form.description}
          onChange={(e) => set("description", e.target.value)}
          placeholder="상품 상세 페이지에 표시될 설명을 입력해 주세요."
        />
      </FieldRow>

      <FieldRow
        label="브랜드 스토리"
        htmlFor="p-story"
        help="상세 페이지의 에디토리얼 영역에 세리프체로 표시되는 카피입니다."
      >
        <Textarea
          id="p-story"
          rows={5}
          value={form.story}
          onChange={(e) => set("story", e.target.value)}
          placeholder="발효가 완성한 곤약의 새로운 식감을 소개해 주세요."
        />
      </FieldRow>

      <FieldRow label="영양 정보" help="예: 열량 → 15kcal, 나트륨 → 10mg">
        <KeyValueEditor
          rows={nutritionRows}
          onChange={setNutritionRows}
          keyPlaceholder="항목 (예: 열량)"
          valuePlaceholder="값 (예: 15kcal)"
          addLabel="영양 항목 추가"
        />
      </FieldRow>

      <FieldRow label="상품 스펙" help="예: 면 굵기 → 1.4mm, 구성 → 면 200g + 소스 40g">
        <KeyValueEditor
          rows={specRows}
          onChange={setSpecRows}
          keyPlaceholder="항목 (예: 면 굵기)"
          valuePlaceholder="값 (예: 1.4mm)"
          addLabel="스펙 항목 추가"
        />
      </FieldRow>
    </div>
  );
}
