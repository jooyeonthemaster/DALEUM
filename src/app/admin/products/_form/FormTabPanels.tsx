"use client";

/* ============================================================
   네 탭의 내용물.

   탭을 바꿔도 입력이 사라지면 안 되므로 넷 다 마운트해 두고 보이는 것만 남긴다
   (특히 상세 탭은 이미지 업로드가 진행 중일 수 있어 언마운트하면 작업이 끊긴다).

   아래 여백(pb)은 여기서 한 번에 준다. 화면 아래 고정된 저장 바가 마지막 입력 줄을 덮어
   '재고 임계치' 행이 절반만 보이던 자리다 — 탭마다 따로 주면 또 어긋난다.
   ============================================================ */

import ImageUploader, { type UploadedImage } from "@/components/admin/ImageUploader";
import type { DetailBlock } from "@/lib/detail-doc";
import type { Category } from "@/lib/types";
import BasicTab from "../BasicTab";
import DetailTab from "../DetailTab";
import VariantsTab from "../VariantsTab";
import type { FormState, KvRow, VariantDraft } from "../form-types";
import type { ProductImageDraft } from "./draft-storage";
import type { FormTabKey } from "./validate";

export interface FormTabPanelsProps {
  tab: FormTabKey;
  isNew: boolean;
  form: FormState;
  set: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
  onNameChange: (name: string) => void;
  onSlugChange: (slug: string) => void;
  categories: Category[];
  /** 카테고리 응답을 아직 기다리는 중 — 기본 정보 탭이 '실패' 와 구분해 말한다 */
  categoriesLoading: boolean;
  /** 카테고리 요청이 실제로 실패했다 */
  categoriesFailed: boolean;
  /** 상품 주소 칸의 펼침 여부 — 저장 실패 후 그 칸으로 데려갈 때 폼이 먼저 펼쳐야 한다 */
  addressOpen: boolean;
  onAddressOpenChange: (open: boolean) => void;
  images: ProductImageDraft[];
  setImages: (next: ProductImageDraft[]) => void;
  imagePrefix: string;
  variants: VariantDraft[];
  setVariants: (next: VariantDraft[]) => void;
  basePrice: number | null;
  detailBlocks: DetailBlock[];
  setDetailBlocks: (blocks: DetailBlock[]) => void;
  /** 상품 사진 탭에서 세로로 긴 사진을 상세페이지 쪽으로 넘길 때 부른다 */
  onSendToDetail?: (files: File[]) => void;
  /** 그렇게 넘어온 파일 (일련번호로 새 반입인지 가린다) */
  detailIntake?: { id: number; files: File[] } | null;
  onDetailIntakeDone?: () => void;
  nutritionRows: KvRow[];
  setNutritionRows: (rows: KvRow[]) => void;
  specRows: KvRow[];
  setSpecRows: (rows: KvRow[]) => void;
}

const PANEL = "pb-28 sm:pb-24";

export default function FormTabPanels(props: FormTabPanelsProps) {
  const { tab } = props;
  return (
    <>
      <div className={tab === "basic" ? PANEL : "hidden"}>
        <BasicTab
          form={props.form}
          set={props.set}
          onNameChange={props.onNameChange}
          onSlugChange={props.onSlugChange}
          categories={props.categories}
          categoriesLoading={props.categoriesLoading}
          categoriesFailed={props.categoriesFailed}
          isNew={props.isNew}
          addressOpen={props.addressOpen}
          onAddressOpenChange={props.onAddressOpenChange}
        />
      </div>

      <div className={tab === "images" ? PANEL : "hidden"}>
        {/* 안내는 업로더가 자기 화면에서 직접 한다 — 여기에 또 적어 두었더니
            "화살표로 순서를 바꾼다"(옛 방식)와 "끌어서 바꾼다"(새 방식)가 한 화면에
            같이 떠서 어느 쪽이 맞는지 알 수 없었다. */}
        <ImageUploader
          value={props.images}
          /* 업로더는 넘겨받은 항목을 그대로 되돌려 주므로 사진 설명(alt)이 함께 살아남는다.
             설명을 적는 입력칸 자체는 업로더 소관이라 여기서 만들지 않는다.
             예전에는 여기서 `as ProductImageDraft[]` 로 형을 우겨넣었고, 그 캐스팅이
             업로더가 alt 를 떨어뜨리던 사실(자르기 경로)을 타입 검사로부터 가려 주고 있었다.
             업로더 타입이 alt 를 아는 지금은 캐스팅 없이 그대로 이어 붙는다 — 같은 유실이 또 생기면 컴파일이 막는다. */
          onChange={(next: UploadedImage[]) => props.setImages(next)}
          bucket="products"
          prefix={props.imagePrefix}
          /* 고객 갤러리가 4:5 로 잘라 보여 준다(catalog/Gallery.tsx 의 aspect-[4/5]).
             관리자 미리보기를 정사각으로 두면 확인한 그림과 나가는 그림이 어긋난다. */
          previewAspect={4 / 5}
          onSendToDetail={props.onSendToDetail}
        />
      </div>

      <div className={tab === "variants" ? PANEL : "hidden"}>
        <VariantsTab
          variants={props.variants}
          onChange={props.setVariants}
          isNew={props.isNew}
          basePrice={props.basePrice}
        />
      </div>

      <div className={tab === "detail" ? PANEL : "hidden"}>
        <DetailTab
          form={props.form}
          set={props.set}
          detailBlocks={props.detailBlocks}
          setDetailBlocks={props.setDetailBlocks}
          uploadPrefix={props.imagePrefix}
          detailIntake={props.detailIntake}
          onDetailIntakeDone={props.onDetailIntakeDone}
          nutritionRows={props.nutritionRows}
          setNutritionRows={props.setNutritionRows}
          specRows={props.specRows}
          setSpecRows={props.setSpecRows}
        />
      </div>
    </>
  );
}
