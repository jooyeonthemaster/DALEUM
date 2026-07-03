"use client";

import Image from "next/image";
import { useState } from "react";
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
 * 상품 상세 갤러리 — 대표 큰 이미지 + 썸네일 스트립.
 * 이미지를 겹쳐 두고 opacity로 부드럽게 페이드 전환한다.
 */
export default function Gallery({ images, name, className = "" }: GalleryProps) {
  const [active, setActive] = useState(0);

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
    <div className={className}>
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
                className={`scale-110 object-cover transition-opacity duration-700 ease-silk ${
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
