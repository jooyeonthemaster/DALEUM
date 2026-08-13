"use client";

import Image from "next/image";
import { useState, type SyntheticEvent } from "react";
import Reveal from "@/components/shop/Reveal";
import Parallax from "@/components/shop/Parallax";

export interface GalleryImage {
  url: string;
  alt: string | null;
}

export interface GalleryProps {
  images: GalleryImage[];
  /** 대체 텍스트 기본값 (상품명) */
  name: string;
  className?: string;
}

/**
 * 상품컷으로 보기엔 지나치게 세로로 긴 이미지의 기준 종횡비(가로÷세로).
 * 정사각(1.0)·4:5(0.8)·2:3(0.67) 같은 정상 상품컷은 전부 이 값보다 커서 영향받지 않는다.
 */
const EXTREME_ASPECT_RATIO = 0.5;

/**
 * 상품 상세 갤러리 — 대표 큰 이미지 + 썸네일 스트립.
 * 이미지를 겹쳐 두고 opacity로 부드럽게 페이드 전환한다.
 *
 * 상세 통이미지(예: 1001×9243)가 실수로 갤러리에 섞여 들어오면 4:5 object-cover로는
 * 중앙 한 조각만 잘려 의미불명 화면이 되므로, 그런 이미지만 object-contain으로 폴백해
 * 전체가 보이게 한다. 원본 치수는 서버에서 알 수 없으므로 로드 시점에 실측한다.
 */
export default function Gallery({ images, name, className = "" }: GalleryProps) {
  const [active, setActive] = useState(0);
  // 실측 결과 종횡비가 극단적이었던 이미지의 인덱스 (초기값은 비어 있어 SSR 결과가 기존과 동일)
  const [tallIndexes, setTallIndexes] = useState<ReadonlySet<number>>(
    () => new Set()
  );

  /** 로드된 이미지의 자연 크기를 재서 극단적으로 세로가 긴 것만 표시해 둔다 */
  const markIfTooTall = (
    index: number,
    event: SyntheticEvent<HTMLImageElement>
  ) => {
    const { naturalWidth, naturalHeight } = event.currentTarget;
    // SVG 등 자연 크기를 못 얻는 경우엔 기존 동작(cover)을 유지한다
    if (!naturalWidth || !naturalHeight) return;
    if (naturalWidth / naturalHeight >= EXTREME_ASPECT_RATIO) return;
    setTallIndexes((prev) => {
      if (prev.has(index)) return prev;
      const next = new Set(prev);
      next.add(index);
      return next;
    });
  };

  if (images.length === 0) {
    return (
      <div
        className={`flex aspect-[4/5] w-full items-center justify-center rounded-sm bg-cream-100 ${className}`}
      >
        <span className="label-caps text-ink-300">Daleum</span>
      </div>
    );
  }

  return (
    // min-w-0 필수 — 이 요소는 상세페이지에서 그리드 아이템이고, 그리드 아이템의 기본
    // min-width:auto 는 콘텐츠 고유 너비를 하한으로 잡는다. 썸네일 스트립이 가로 flex 라
    // 이미지가 여러 장이면(8장 = 약 550px) 컬럼이 그만큼 늘어나 페이지 전체에 가로
    // 스크롤이 생긴다. 0 으로 풀어야 스트립 자신의 overflow-x-auto 가 실제로 동작한다.
    <div className={`min-w-0 ${className}`}>
      {/* 대표 이미지 — 커튼 리빌 + 은은한 패럴랙스, 겹쳐 놓고 페이드 전환 */}
      <Reveal variant="clip">
        <div className="relative aspect-[4/5] w-full overflow-hidden rounded-sm bg-cream-100">
          <Parallax speed={30} className="absolute inset-0">
            {images.map((img, i) => (
              <Image
                key={`${img.url}-${i}`}
                src={img.url}
                alt={img.alt ?? name}
                fill
                priority={i === 0}
                sizes="(min-width: 1024px) 50vw, 100vw"
                onLoad={(e) => markIfTooTall(i, e)}
                className={`${
                  // 초세로 이미지는 패럴랙스 여유 스케일까지 빼고 통째로 보여준다
                  tallIndexes.has(i) ? "object-contain" : "scale-110 object-cover"
                } transition-opacity duration-700 ease-silk ${
                  i === active ? "opacity-100" : "opacity-0"
                }`}
                aria-hidden={i !== active}
              />
            ))}
          </Parallax>
        </div>
      </Reveal>

      {/* 썸네일 스트립 */}
      {images.length > 1 && (
        <Reveal variant="fade" delay={0.35}>
          <div
            className="mt-3 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            role="tablist"
            aria-label="상품 이미지"
          >
          {images.map((img, i) => (
            <button
              key={`thumb-${img.url}-${i}`}
              type="button"
              role="tab"
              aria-selected={i === active}
              aria-label={`${i + 1}번째 이미지 보기`}
              onClick={() => setActive(i)}
              className={`relative aspect-[4/5] w-16 shrink-0 overflow-hidden rounded-sm border transition-colors duration-300 ${
                i === active
                  ? "border-ink-900"
                  : "border-transparent opacity-70 hover:border-ink-300 hover:opacity-100"
              }`}
            >
              <Image
                src={img.url}
                alt=""
                fill
                sizes="64px"
                // 썸네일은 64x80 로 작아서 contain 을 쓰면 초세로 이미지가 폭 6px 실선이 되어
                // 오히려 "이미지가 있다"는 것조차 안 보인다. 크롭 조각이라도 보이도록 cover 를 유지한다.
                className="object-cover"
              />
            </button>
          ))}
          </div>
        </Reveal>
      )}
    </div>
  );
}
