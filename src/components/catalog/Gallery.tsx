"use client";

import Image from "next/image";
import { useRef, useState, type SyntheticEvent } from "react";
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
 *
 * 지연 로드: 겹쳐 놓은 구조에서는 loading="lazy" 가 무력하다 — 전부 뷰포트 안이라
 * 브라우저가 첫 진입에 보이지도 않는 이미지까지 전부 받아 버린다(상품당 최대 7장).
 * 그래서 "한 번이라도 활성화된 적 있는" 인덱스만 실제로 마운트한다.
 */
export default function Gallery({ images, name, className = "" }: GalleryProps) {
  const [active, setActive] = useState(0);
  /**
   * 실제로 <Image>를 렌더할 인덱스.
   * 첫 화면에는 대표 이미지(0번) 하나만 내려간다. 썸네일을 눌러 활성화된 시점에 추가하며,
   * 한 번 들어온 인덱스는 절대 빼지 않는다 — 되돌아왔을 때 이미 로드돼 있어야
   * 깜빡임 없이 페이드 전환이 그대로 동작한다.
   */
  const [mounted, setMounted] = useState<ReadonlySet<number>>(
    () => new Set([0])
  );
  /**
   * 로드가 끝난 인덱스.
   * 표시 전환과 object-fit 판정이 모두 "픽셀이 준비됐는가"에 달려 있어서 따로 추적한다.
   */
  const [loaded, setLoaded] = useState<ReadonlySet<number>>(() => new Set());
  /**
   * 실제로 화면에 떠 있는 인덱스. 선택(active)과 분리한다.
   *
   * 이걸 나누지 않으면, 아직 받지 않은 이미지를 고른 순간 이전 이미지가 곧바로
   * 페이드 아웃을 시작해 버려 새 이미지가 도착할 때까지 빈 크림색 박스가 남는다
   * (실측: 클릭 200ms 뒤 최대 opacity 0.14). displayed 는 목표 이미지가 로드된
   * 뒤에만 옮겨가므로, 이전 이미지가 끝까지 자리를 지키다 곧바로 크로스페이드된다.
   */
  const [displayed, setDisplayed] = useState(0);
  // 실측 결과 종횡비가 극단적이었던 이미지의 인덱스 (초기값은 비어 있어 SSR 결과가 기존과 동일)
  const [tallIndexes, setTallIndexes] = useState<ReadonlySet<number>>(
    () => new Set()
  );

  /** onLoad 콜백이 "지금 선택된 인덱스"를 봐야 하는데 클로저는 낡은 값을 잡는다 */
  const activeRef = useRef(0);
  activeRef.current = active;

  /**
   * 썸네일 선택.
   *
   * active 는 즉시 바꿔 썸네일 강조가 클릭에 곧바로 반응하게 한다.
   * 다만 **실제로 화면에 띄우는 것은 로드가 끝난 뒤**다(아래 opacity 판정).
   * 지연 마운트를 도입하면서 활성화를 rAF 2프레임 뒤로 고정했더니,
   * 아직 받아오지 못한 이미지로 전환되며 "사진 → 빈 크림색 박스 → 사진" 이 됐다.
   * 로드 완료를 기다리면 이전 이미지가 그대로 남아 있다가 곧바로 크로스페이드된다.
   */
  const selectImage = (index: number) => {
    setActive(index);
    setMounted((prev) => {
      if (prev.has(index)) return prev;
      const next = new Set(prev);
      next.add(index);
      return next;
    });
    // 이미 받아 둔 이미지면 곧바로 교체한다. 아직이면 handleLoad 가 도착 시점에 옮긴다.
    if (loaded.has(index)) setDisplayed(index);
  };

  /**
   * 로드 완료 처리 — 표시 자격 부여와 종횡비 실측을 같은 이벤트에서 끝낸다.
   *
   * 두 setState 가 같은 배치에서 반영되므로, 이미지가 보이기 시작하는 렌더에는
   * 이미 올바른 object-fit 이 적용돼 있다. 초세로 이미지가 cover 로 한 프레임
   * 잘려 보였다가 contain 으로 튀는 일이 생기지 않는다.
   */
  const handleLoad = (
    index: number,
    event: SyntheticEvent<HTMLImageElement>
  ) => {
    const { naturalWidth, naturalHeight } = event.currentTarget;
    // SVG 등 자연 크기를 못 얻는 경우엔 기존 동작(cover)을 유지한다
    if (naturalWidth && naturalHeight && naturalWidth / naturalHeight < EXTREME_ASPECT_RATIO) {
      setTallIndexes((prev) => {
        if (prev.has(index)) return prev;
        const next = new Set(prev);
        next.add(index);
        return next;
      });
    }
    setLoaded((prev) => {
      if (prev.has(index)) return prev;
      const next = new Set(prev);
      next.add(index);
      return next;
    });
    // 기다리던 그 이미지가 도착한 경우에만 교체한다 —
    // 로딩 중 사용자가 다른 썸네일을 눌렀다면 뒤늦게 도착한 이미지가 화면을 가로채면 안 된다.
    if (activeRef.current === index) setDisplayed(index);
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
            {/* 아직 활성화된 적 없는 이미지는 아예 마운트하지 않는다 — 겹쳐 놓은 구조라
                DOM 에 있기만 하면 뷰포트 안이라 브라우저가 즉시 내려받기 때문이다.
                0번은 LCP 이미지라 언제나 마운트 + priority 로 즉시 로드한다. */}
            {images.map((img, i) =>
              mounted.has(i) ? (
                <Image
                  key={`${img.url}-${i}`}
                  src={img.url}
                  alt={img.alt ?? name}
                  fill
                  priority={i === 0}
                  sizes="(min-width: 1024px) 50vw, 100vw"
                  onLoad={(e) => handleLoad(i, e)}
                  className={`${
                    // 초세로 이미지는 패럴랙스 여유 스케일까지 빼고 통째로 보여준다
                    tallIndexes.has(i) ? "object-contain" : "scale-110 object-cover"
                  } transition-opacity duration-700 ease-silk ${
                    // displayed 는 로드가 끝난 뒤에만 옮겨간다 — 아직 못 받은 이미지로
                    // 전환하면 빈 컨테이너(bg-cream-100)가 그대로 노출되기 때문이다.
                    i === displayed ? "opacity-100" : "opacity-0"
                  }`}
                  aria-hidden={i !== displayed}
                />
              ) : null
            )}
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
              onClick={() => selectImage(i)}
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
