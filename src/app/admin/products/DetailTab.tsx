"use client";

/* ============================================================
   상세·영양 탭.

   옛 구조는 상세페이지·브랜드 스토리·영양·스펙을 한 줄로 쭉 이어 붙인 것이었다.
   영양 12줄 + 스펙 22줄인 상품에서는 탭 하나가 스크롤 다섯 번 길이가 되고,
   맨 아래 스펙을 고치는 동안 위쪽에 무엇을 썼는지 볼 수 없다.
   그래서 네 구역으로 접어 두고, 구역마다 '이 내용이 고객 화면 어디에 실리는지'를
   한 줄로 붙였다.
   ============================================================ */

import CustomerLayoutMap from "@/components/admin/detail/CustomerLayoutMap";
import DetailPageEditor from "@/components/admin/detail/DetailPageEditor";
import EditorSection from "@/components/admin/detail/EditorSection";
import StoryEditor from "@/components/admin/detail/StoryEditor";
import { NUTRITION_PRESETS, SPEC_PRESETS } from "@/components/admin/detail/kv-presets";
import KeyValueEditor from "./KeyValueEditor";
import type { DetailBlock } from "@/lib/detail-doc";
import type { FormState, KvRow } from "./form-types";

export interface DetailTabProps {
  form: FormState;
  set: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
  /** 상세페이지 본문 — 마크다운 원문 대신 칸 목록으로 다룬다 */
  detailBlocks: DetailBlock[];
  setDetailBlocks: (blocks: DetailBlock[]) => void;
  /** 상세 이미지를 올릴 경로 접두어 (상품 id 또는 임시 초안 id) */
  uploadPrefix: string;
  /** 상품 사진 탭에서 "상세페이지로 보내기" 로 넘어온 파일 */
  detailIntake?: { id: number; files: File[] } | null;
  onDetailIntakeDone?: () => void;
  nutritionRows: KvRow[];
  setNutritionRows: (rows: KvRow[]) => void;
  specRows: KvRow[];
  setSpecRows: (rows: KvRow[]) => void;
}

/** 채워진 줄만 센다 — 빈 줄까지 세면 요약이 거짓말이 된다 */
function filledCount(rows: KvRow[]): number {
  return rows.filter((r) => r.key.trim() && r.value.trim()).length;
}

export default function DetailTab({
  form,
  set,
  detailBlocks,
  setDetailBlocks,
  uploadPrefix,
  detailIntake,
  onDetailIntakeDone,
  nutritionRows,
  setNutritionRows,
  specRows,
  setSpecRows,
}: DetailTabProps) {
  const imageCount = detailBlocks.filter((b) => b.type === "image").length;
  const textCount = detailBlocks.length - imageCount;
  const storyFilled = form.story.trim() !== "";

  return (
    // 화면 하단에 고정된 저장 바가 마지막 입력 줄을 덮지 않도록 아래를 비워 둔다
    <div className="pb-24">
      <CustomerLayoutMap />

      <div className="mt-2">
        <EditorSection
          title="상세페이지"
          description="넣은 사진은 페이지 아래 「상품 상세」에 전체 폭으로, 글은 가격 위 구매 영역에 요약으로 실립니다."
          summary={
            <>
              사진 <span className="krw">{imageCount}</span>장 · 글{" "}
              <span className="krw">{textCount}</span>칸
            </>
          }
        >
          <DetailPageEditor
            blocks={detailBlocks}
            onChange={setDetailBlocks}
            productName={form.name}
            uploadPrefix={uploadPrefix}
            intake={detailIntake}
            onIntakeDone={onDetailIntakeDone}
          />
        </EditorSection>

        <EditorSection
          title="브랜드 스토리"
          description="상품 페이지 가운데 「다름이 빚은 이야기」 구역에 큰 글씨로 실립니다. 비워 두면 그 구역이 통째로 사라집니다."
          summary={storyFilled ? undefined : "비어 있음"}
          defaultOpen={false}
        >
          <StoryEditor story={form.story} onChange={(story) => set("story", story)} />
        </EditorSection>

        <EditorSection
          title="영양 정보"
          description="페이지 아래 「영양 정보」 표에 두 칸으로 실립니다. 포장 뒷면 영양성분표를 그대로 옮겨 적으세요."
          summary={
            <>
              채운 항목 <span className="krw">{filledCount(nutritionRows)}</span>개
            </>
          }
          defaultOpen={false}
        >
          <KeyValueEditor
            rows={nutritionRows}
            onChange={setNutritionRows}
            presets={NUTRITION_PRESETS}
            noun="영양 항목"
            keyPlaceholder="항목 (예: 열량)"
            valuePlaceholder="값 (예: 170kcal)"
            addLabel="영양 항목 추가"
          />
        </EditorSection>

        <EditorSection
          title="상품 스펙"
          description="페이지 맨 아래 「상세 정보」 표에 실립니다. 원재료명·소비기한 같은 법정 표시사항을 여기에 적습니다."
          summary={
            <>
              채운 항목 <span className="krw">{filledCount(specRows)}</span>개
            </>
          }
          defaultOpen={false}
        >
          <KeyValueEditor
            rows={specRows}
            onChange={setSpecRows}
            presets={SPEC_PRESETS}
            noun="스펙 항목"
            keyPlaceholder="항목 (예: 내용량)"
            valuePlaceholder="값 (예: 150g (1팩))"
            addLabel="스펙 항목 추가"
          />
        </EditorSection>
      </div>
    </div>
  );
}
