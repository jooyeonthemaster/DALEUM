"use client";

/* ============================================================
   카테고리 대표 이미지 — 올린 사진이 홈에서 "어떻게 잘리는지" 까지 보여 준다.

   왜 전용 컴포넌트인가:
   전에는 48px 정사각 썸네일 하나가 전부였다. 그런데 이 사진이 실제로 걸리는 자리는
   여럿이고 비율이 전부 다르다(홈 큰 타일 3:2, 옆 타일 4:5·16:11, 아래 넓은 타일 4:3·21:8).
   정사각 미리보기만 보고 올리면 홈에서 글자가 잘려 나가는 걸 확인할 방법이 없었다.
   또 비워 두면 "아무것도 안 나온다" 가 아니라 홈이 임의의 사진을 자동으로 걸어 준다 —
   밥 카테고리에 국수 사진이 걸리는 사고가 그래서 났다. 그것도 여기서 미리 보여 준다.

   업로드는 lib/admin-upload 의 uploadGalleryImage 를 쓴다. 용량 상한이 없고
   브라우저가 알아서 줄여 올리므로 원본을 그대로 던져도 된다.
   ============================================================ */

import { useRef, useState } from "react";
import Image from "next/image";
import { ImagePlus, Trash2 } from "lucide-react";
import { Help } from "@/components/admin/Field";
import { isImageFile, uploadGalleryImage } from "@/lib/admin-upload";
import { IMAGE_USAGE_HELP } from "./category-types";

export interface CategoryImageFieldProps {
  value: string | null;
  onChange: (url: string | null) => void;
  /** 이미지를 비웠을 때 홈이 자동으로 걸어 줄 사진 */
  fallbackImage: string;
  /** 지금 설정으로 이 카테고리가 홈 화면에 실제로 나오는가 (숨김이거나 9번째 이후면 false) */
  showsOnHome: boolean;
}

/**
 * 홈에서 이 사진이 잘리는 모양 — CategoryShowcase.tsx:97-116, 150-152 의 실제 aspect 값이다.
 *
 * 세 모양만 보여 주던 때의 문제: 4:5 · 16:11 · 21:8 을 골라 놨는데 21:8 은
 * **아래 넓은 줄에 타일이 딱 하나일 때만** 나오는 모양이라, 정작 지금 쓰이고 있는
 * 4:3(아래 줄이 3의 배수일 때)은 어디에도 없었다. 노출 카테고리 6개인 지금은
 * 첫 타일 1 + 옆 2 + 아래 3 이므로 아래 줄은 전부 4:3 으로 잘린다.
 * 그래서 실제로 나타나는 네 모양을 모두 놓고, 각 모양이 **언제** 쓰이는지 함께 적는다.
 *
 * 카테고리 수를 여기서 알 수 없어(수정 창은 그 수를 넘겨받지 않는다) 조건을 글로 적었다.
 * 자리 순서는 홈 화면 순서(옆 타일 → 아래 줄)를 따른다.
 */
const CROPS = [
  { label: "옆 타일", when: "옆에 하나만 있을 때", ratio: "4 / 5" },
  { label: "옆 타일", when: "옆에 둘 있을 때", ratio: "16 / 11" },
  { label: "아래 넓은 줄", when: "아래가 3·6개일 때 (지금 이 모양)", ratio: "4 / 3" },
  { label: "아래 넓은 줄", when: "아래가 하나뿐일 때", ratio: "21 / 8" },
];

export default function CategoryImageField({
  value,
  onChange,
  fallbackImage,
  showsOnHome,
}: CategoryImageFieldProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dropping, setDropping] = useState(false);

  async function ingest(files: File[]) {
    const file = files.find(isImageFile);
    if (!file) {
      setError("사진 파일을 올려 주세요.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const asset = await uploadGalleryImage(file, { prefix: "categories" });
      onChange(asset.url);
    } catch (e) {
      // 서버 원문(Supabase 메시지)은 admin-upload 가 이미 사람 말로 바꿔 던진다
      setError(e instanceof Error ? e.message : "사진을 올리지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  const shown = value ?? fallbackImage;

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDropping(true);
        }}
        onDragLeave={() => setDropping(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDropping(false);
          void ingest(Array.from(e.dataTransfer.files));
        }}
        className={`border border-dashed p-4 transition-colors ${
          dropping ? "border-forest-700 bg-forest-50" : "border-ink-300 bg-cream-50"
        }`}
      >
        {/* 자리별 잘림 미리보기 — 세 모양을 나란히 놓아야 어디가 잘리는지 한눈에 보인다 */}
        <p className="mb-2 text-[11px] leading-relaxed text-ink-500">
          홈 화면은 자리와 화면 폭, 그리고 노출한 카테고리 수에 따라 사진을 다르게 잘라 씁니다.
          아래 네 모양 모두에서 중요한 부분이 남는지 확인해 주세요.
        </p>
        {/* 높이를 맞추고 폭이 비율을 따라가게 둔다 —
            폭을 맞추면 세로 4:5 와 가로 21:8 의 아래 설명이 서로 다른 줄에 놓여 비교가 안 된다.
            높이를 24(96px)에서 16(64px)으로 줄이고 설명 폭을 20(80px)으로 묶은 이유:
            1440 화면에서 이 칸의 실측 폭은 492px 인데, 96px 높이에서는 네 모양의 폭 합이
            그것을 넘어 두 줄로 접혔다. 접히는 순간 "나란히 놓고 비교한다" 는 이 미리보기의
            목적 자체가 사라진다. 지금은 합계 450px 로 한 줄에 들어간다. */}
        <div className="flex flex-wrap items-start gap-2">
          {CROPS.map((crop) => (
            <figure key={`${crop.label}-${crop.ratio}`} className="shrink-0">
              <div
                className="relative h-16 overflow-hidden bg-cream-100"
                style={{ aspectRatio: crop.ratio }}
              >
                <Image
                  src={shown}
                  alt={`${crop.label} — ${crop.when} 미리보기`}
                  fill
                  sizes="240px"
                  className={`object-cover ${value ? "" : "opacity-45 grayscale"}`}
                />
              </div>
              <figcaption className="mt-1 max-w-20 text-[10px] leading-tight text-ink-400">
                {crop.label}
                <span className="block text-ink-300">{crop.when}</span>
              </figcaption>
            </figure>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="inline-flex items-center gap-1.5 border border-ink-200 bg-cream-50 px-3 py-2 text-xs text-ink-700 transition-colors hover:bg-cream-100 disabled:opacity-50"
          >
            <ImagePlus size={14} strokeWidth={1.5} />
            {busy ? "올리는 중…" : value ? "다른 사진으로 바꾸기" : "사진 올리기"}
          </button>
          {value && (
            <button
              type="button"
              onClick={() => onChange(null)}
              disabled={busy}
              className="inline-flex items-center gap-1.5 px-2 py-2 text-xs text-ink-500 transition-colors hover:text-signal-red disabled:opacity-50"
            >
              <Trash2 size={14} strokeWidth={1.5} />
              사진 비우기
            </button>
          )}
          <span className="text-[11px] text-ink-400">끌어다 놓아도 됩니다</span>
        </div>

        {/* 홈에 안 나오는 카테고리에 "대체 사진이 걸린다" 고 겁주면 그것도 거짓말이다.
            지금 설정으로 홈에 실제로 나오는지에 따라 말을 다르게 한다. */}
        {!value &&
          (showsOnHome ? (
            <p className="mt-2 text-xs leading-relaxed text-signal-amber">
              사진을 비워 두면 홈 화면에는 위 사진이 자동으로 걸립니다. 카테고리와 맞지 않는
              사진일 수 있으니 직접 올리는 편이 안전합니다.
            </p>
          ) : (
            <p className="mt-2 text-xs leading-relaxed text-ink-500">
              이 카테고리는 지금 홈 화면에 나오지 않아 사진이 쓰이는 곳이 없습니다. 나중에 홈에
              올릴 수 있으니 미리 올려 두어도 됩니다.
            </p>
          ))}
        {error && <p className="mt-2 text-xs text-signal-red">{error}</p>}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          void ingest(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />

      <Help>{IMAGE_USAGE_HELP}</Help>
    </div>
  );
}
