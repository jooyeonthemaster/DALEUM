"use client";

/* ============================================================
   detailImage 노드뷰 — 사진 한 장과 그 위의 조작 도구

   여기가 이 편집기에서 제일 잘 깨지는 자리다. 이유는 두 가지다.

   1) 좌표계가 셋이다(화면/문서/비율). 스테이지가 축소돼 있으면 포인터가 움직인
      화면 픽셀과 문서 픽셀이 다르다. 그 변환을 이벤트 핸들러 안에서 즉석으로
      계산하면 반드시 어긋난다 — 그래서 계산은 전부 resize-math.ts(25개 테스트로
      검증됨)에 맡기고, 이 파일은 "언제 재고 어디에 쓰는가" 만 다룬다.

   2) 드래그 중 React state 를 건드리면 프레임마다 노드뷰가 다시 그려지고,
      ProseMirror 트랜잭션까지 얹히면 손이 화면보다 앞서 간다("뚝뚝 끊긴다").
      그래서 움직이는 동안에는 DOM 의 style.width 만 직접 쓰고, 문서에는
      pointerup 에서 딱 한 번 적는다. 부작용으로 실행취소가 드래그당 1회가 되어
      Ctrl+Z 한 번이면 드래그 전 폭으로 정확히 돌아간다.

   화면 폭은 고객 화면과 1:1 이어야 하므로 클래스를 손으로 옮겨 적지 않고
   detail-prose.ts 의 FLOW / IMAGE_ALIGN_CLASS 를 그대로 가져다 쓴다.
   세로(테두리·사이 여백)도 1:1 이어야 하므로 이웃과 이어지는지를 seamless.ts 에
   물어본다 — 폭만 맞고 세로가 끊기면 미리보기는 여전히 거짓말이다.
   ============================================================ */

import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, SyntheticEvent } from "react";
import { NodeViewWrapper, type ReactNodeViewProps } from "@tiptap/react";
import { FLOW, IMAGE_ALIGN_CLASS } from "@/components/catalog/detail-prose";
import DetailImageToolbar from "./DetailImageToolbar";
import { isSeamlessNode, useSeamlessJoin } from "./seamless";
import {
  WIDTH_SNAPS,
  normalizePct,
  resolveWidthPct,
  toDocumentX,
  type ResizeHandle,
  type ResizeSession,
} from "./resize-math";
/* 스테이지 축소율은 resize-math 의 stageScale() 로 구하지만, 그것을 부르는 쪽은
   캔버스(EditorStage)다. 노드뷰는 이미 계산된 결과를 컨텍스트로 받기만 한다 —
   한 화면에 이미지가 30장이면 30번 같은 값을 다시 재는 셈이 되기 때문이다. */
import { useEditorStage } from "./stage-context";
import type { Align } from "@/lib/detail-doc-v2";

/* ------------------------------------------------------------
   상위(편집기)와의 계약
   ------------------------------------------------------------ */

/**
 * 「자르기」 요청 — window 이벤트로 올린다.
 *
 * TipTap 에서 노드뷰가 상위 React 트리로 무언가를 올리려면 확장 options 에
 * 콜백을 심고 extension.options 로 꺼내야 하는데, 그 배선은 확장 정의·에디터
 * 생성·모달 상태 세 곳에 걸쳐 있어 한 곳만 어긋나도 조용히 죽는다.
 * 크롭은 "드물게 한 번, 모달을 연다" 뿐이라 그 배선값을 하지 않는다.
 */
export const CROP_REQUEST_EVENT = "daleum:crop-request";

/**
 * 노드 속성을 읽어 빈 자리를 메운 값.
 * extensions.ts 의 `DetailImageAttrs`(넣을 때 쓰는 느슨한 입력형)와 이름을 나눈 것은
 * 의도다 — 이쪽은 선택 속성이 하나도 없는 "읽고 난 뒤" 의 모양이다.
 */
export interface ResolvedImageAttrs {
  src: string;
  alt: string;
  width: number;
  height: number;
  widthPct: number;
  align: Align;
  sourceUrl: string | null;
}

export interface CropRequestDetail {
  /** 문서 안 위치 — 크롭 결과를 되돌려 쓸 때 필요하다 */
  pos: number;
  attrs: ResolvedImageAttrs;
}

/* 치수 표기가 없는 옛 데이터의 공칭값. detail-doc-v2 / tiptap-bridge 가 쓰는 값과
   같아야 한다 — 다르면 같은 사진이 편집기와 고객 화면에서 다른 높이로 자리를 잡는다. */
const NOMINAL_WIDTH = 1080;
const NOMINAL_HEIGHT = 4000;

function readAttrs(raw: Record<string, unknown>): ResolvedImageAttrs {
  const pct = Number(raw.widthPct);
  const align = raw.align === "center" || raw.align === "right" ? raw.align : "left";
  return {
    src: typeof raw.src === "string" ? raw.src : "",
    alt: typeof raw.alt === "string" ? raw.alt : "",
    width: Number(raw.width) || NOMINAL_WIDTH,
    height: Number(raw.height) || NOMINAL_HEIGHT,
    widthPct: Number.isFinite(pct) ? Math.min(100, Math.max(5, pct)) : 100,
    align,
    sourceUrl: typeof raw.sourceUrl === "string" && raw.sourceUrl ? raw.sourceUrl : null,
  };
}

/** 지금 폭이 스냅 지점에 정확히 붙었는가 — resolveWidthPct 가 붙일 때는 값이 정확히 같다 */
function isSnapped(pct: number): boolean {
  return WIDTH_SNAPS.some((s) => Math.abs(s - pct) < 0.01);
}

/* ------------------------------------------------------------
   노드뷰
   ------------------------------------------------------------ */

export default function DetailImageView({
  editor,
  node,
  selected,
  updateAttributes,
  deleteNode,
  getPos,
  view,
}: ReactNodeViewProps) {
  const attrs = readAttrs(node.attrs as Record<string, unknown>);
  const { contentWidth, scale, stageLeft } = useEditorStage();

  /* 폭을 직접 고쳐 쓸 DOM. 드래그 중에는 이 한 곳만 만진다. */
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const badgeRef = useRef<HTMLSpanElement | null>(null);

  const sessionRef = useRef<ResizeSession | null>(null);
  const pointerRef = useRef({ x: 0, y: 0 });
  const rafRef = useRef<number | null>(null);
  /* 드래그 시작 시점의 프레임 상단(화면 좌표). 배지를 포인터 높이에 붙이는 데 쓴다.
     매 프레임 getBoundingClientRect 를 부르면 폭을 쓴 직후라 강제 리플로가 난다. */
  const frameTopRef = useRef(0);
  const measuredRef = useRef("");

  const [dragging, setDragging] = useState<ResizeHandle | null>(null);

  /* 고객 화면이 이 사진을 이웃과 한 덩어리로 묶는가(폭 100%·가운데 정렬).
     판정은 고객 렌더러와 **같은 함수**를 쓴다 — 두 화면이 갈라질 수 없게. */
  const seamless = isSeamlessNode(node);
  const join = useSeamlessJoin(editor, getPos, seamless);

  /* ---------- 드래그 ---------- */

  /** rAF 안에서만 실행 — pointermove 가 한 프레임에 여러 번 와도 그리기는 한 번이다 */
  const paint = useCallback(() => {
    rafRef.current = null;
    const session = sessionRef.current;
    const frame = frameRef.current;
    if (!session || !frame) return;

    const pct = resolveWidthPct(session, pointerRef.current.x);
    frame.style.width = `${pct}%`;

    const badge = badgeRef.current;
    if (badge) {
      badge.textContent = `${Math.round(pct)}%`;
      /* 배지는 축소된 스테이지 **안쪽**에 있다. 포인터와 프레임 상단의 차이는 화면 px 인데
         그대로 top 에 쓰면 (1-k)×거리 만큼 어긋난 자리에 붙는다. 통이미지는 화면 높이가
         수천 px 이라 k=0.7 만 되어도 배지가 수백 px 위로 달아난다.
         resize-math 의 규칙대로 화면 px 은 쓰기 전에 문서 px 로 되돌린다. */
      badge.style.top = `${(pointerRef.current.y - frameTopRef.current) / (session.scale || 1)}px`;
      // 자석에 붙은 순간을 색으로 알린다 — 숫자만으로는 붙었는지 알 수 없다
      const snapped = isSnapped(pct);
      badge.classList.toggle("bg-forest-600", snapped);
      badge.classList.toggle("bg-ink-900", !snapped);
    }
  }, []);

  const beginDrag = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>, handle: ResizeHandle) => {
      // ProseMirror 가 mousedown 을 받아 글자 선택 드래그를 시작하지 못하게 막는다
      e.preventDefault();
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);

      /* 축소율·스테이지 위치는 시작 순간의 값을 스냅숏으로 들고 간다.
         드래그 도중 창이 리사이즈돼 값이 바뀌면 시작점과 현재점이 서로 다른
         좌표계로 계산되어 이미지가 순간 튄다. */
      sessionRef.current = {
        startDocX: toDocumentX(e.clientX, stageLeft, scale),
        startPct: attrs.widthPct,
        contentWidth,
        scale,
        stageLeft,
        handle,
        centered: attrs.align === "center",
      };
      pointerRef.current = { x: e.clientX, y: e.clientY };
      frameTopRef.current = frameRef.current?.getBoundingClientRect().top ?? 0;
      document.body.style.userSelect = "none";
      setDragging(handle);
    },
    [attrs.align, attrs.widthPct, contentWidth, scale, stageLeft]
  );

  const onDragMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!sessionRef.current) return;
      pointerRef.current = { x: e.clientX, y: e.clientY };
      if (rafRef.current !== null) return;
      rafRef.current = requestAnimationFrame(paint);
    },
    [paint]
  );

  const endDrag = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const session = sessionRef.current;
      if (!session) return;
      sessionRef.current = null;

      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      document.body.style.userSelect = "";
      setDragging(null);

      /* 마지막 좌표로 한 번 더 계산한다 — 취소된 rAF 가 삼킨 마지막 움직임이
         있으면 화면과 저장값이 1~2% 어긋난 채로 남는다. */
      const finalPct = normalizePct(resolveWidthPct(session, e.clientX));
      if (frameRef.current) frameRef.current.style.width = `${finalPct}%`;
      // 문서에 적는 것은 여기 단 한 번 → 실행취소 항목도 드래그당 하나
      if (finalPct !== attrs.widthPct) updateAttributes({ widthPct: finalPct });
    },
    [attrs.widthPct, updateAttributes]
  );

  /* 손으로 쓴 style.width 와 문서의 widthPct 가 갈라진 채 남지 않게 맞춰 둔다.
     (React 는 style prop 이 그대로면 DOM 을 되돌려 주지 않는다) */
  useEffect(() => {
    if (sessionRef.current) return;
    if (frameRef.current) frameRef.current.style.width = `${attrs.widthPct}%`;
  }, [attrs.widthPct]);

  useEffect(
    () => () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      document.body.style.userSelect = "";
    },
    []
  );

  /* ---------- 이어붙는 슬라이스의 세로 여백 ---------- */

  /**
   * 본문 세로 리듬(FLOW.root 의 space-y)은 ProseMirror 루트가 노드뷰 **바깥 껍데기**에
   * 주는 것이라 이 컴포넌트가 붙이는 클래스로는 끌 수 없다. 그 껍데기는
   * ReactNodeViewRenderer 가 만든 요소이고, NodeViewWrapper 의 부모가 정확히 그것이다
   * (@tiptap/react 의 ReactNodeView.dom 이 같은 관계를 전제로 쓰인다).
   * 이어붙는 슬라이스 사이에서만 그 여백을 0 으로 눌러 고객 화면의 덩어리와 같은 모양을 만든다.
   */
  useEffect(() => {
    const host = wrapperRef.current?.parentElement;
    if (!host) return;
    host.style.marginBlockStart = join.prev ? "0px" : "";
    host.style.marginBlockEnd = join.next ? "0px" : "";
  }, [join.prev, join.next]);

  /* ---------- 실제 치수 보정 ---------- */

  /**
   * 옛 데이터에는 치수가 공칭값(1080×4000)으로 박혀 있는 것이 있다. 그대로 두면
   * 종횡비가 틀려 자리 예약이 어긋나고, 이미지가 뜨는 순간 페이지가 출렁인다.
   * 실제 파일 치수를 알게 된 김에 조용히 고쳐 둔다 — 관리자가 한 일이 아니므로
   * 실행취소 스택에도, **폼의 변경 감지에도** 남기지 않는다.
   *
   * addToHistory:false 만으로는 부족했다. 그것은 실행취소만 막을 뿐 onUpdate 는
   * 그대로 타고 나가, 상세 탭을 **열기만 해도** 폼이 "저장하지 않은 변경" 이 되고
   * 초안이 자동 저장돼 다음 방문에 "이어서 쓰시겠습니까" 가 뜬다(관리자는 아무것도
   * 만지지 않았다). preventUpdate 는 TipTap 이 update 이벤트 자체를 건너뛰는 표식이다.
   * 고쳐 둔 치수는 다음 실제 편집 때 문서와 함께 저장된다.
   */
  const onImageLoad = useCallback(
    (e: SyntheticEvent<HTMLImageElement>) => {
      const img = e.currentTarget;
      const nw = img.naturalWidth;
      const nh = img.naturalHeight;
      if (nw <= 0 || nh <= 0) return;
      if (measuredRef.current === img.src) return;
      measuredRef.current = img.src;
      if (nw === attrs.width && nh === attrs.height) return;

      const pos = getPos();
      if (typeof pos !== "number") return;
      try {
        const tr = view.state.tr.setNodeMarkup(pos, undefined, {
          ...node.attrs,
          width: nw,
          height: nh,
        });
        tr.setMeta("addToHistory", false);
        tr.setMeta("preventUpdate", true);
        view.dispatch(tr);
      } catch {
        /* 그 사이 문서가 바뀌어 위치가 사라졌다면 보정 자체가 의미 없다 */
      }
    },
    [attrs.width, attrs.height, getPos, node.attrs, view]
  );

  /* ---------- 도구 ---------- */

  const requestCrop = useCallback(() => {
    const pos = getPos();
    if (typeof pos !== "number" || !attrs.src) return;
    window.dispatchEvent(
      new CustomEvent<CropRequestDetail>(CROP_REQUEST_EVENT, { detail: { pos, attrs } })
    );
  }, [attrs, getPos]);

  const setAlign = useCallback(
    (align: Align) => updateAttributes({ align }),
    [updateAttributes]
  );
  const setWidth = useCallback(
    (widthPct: number) => updateAttributes({ widthPct }),
    [updateAttributes]
  );

  /* ---------- 그리기 ---------- */

  const frameClass = [
    FLOW.imageFrame, // 테두리 + cream-100 바탕 — 사진이 뜨기 전 흰 구멍이 생기지 않는다
    IMAGE_ALIGN_CLASS[attrs.align],
    "relative block",
    // 맞닿는 테두리는 지운다 — 고객은 덩어리 전체에 테두리 한 겹만 본다
    join.prev ? "border-t-0" : "",
    join.next ? "border-b-0" : "",
    selected ? "outline-2 outline-forest-600" : "hover:outline-1 hover:outline-ink-300",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    /* as 를 넘기지 않는 이유: NodeViewWrapper 는 받은 props 를 그대로 태그에 펼친다.
       as="div" 는 기본값과 똑같은 div 를 만들면서 DOM 에 <div as="div"> 만 남긴다. */
    <NodeViewWrapper
      ref={wrapperRef}
      className="relative"
      data-detail-image=""
      data-align={attrs.align}
      data-seamless={seamless ? "" : undefined}
    >
      <div
        ref={frameRef}
        data-image-frame=""
        className={frameClass}
        style={{ width: `${attrs.widthPct}%` }}
      >
        {/* next/image 를 쓰지 않는 이유: 편집 중에는 폭이 프레임마다 바뀌는데
            그때마다 최적화 요청이 새로 나가 오히려 사진이 깜빡인다.
            width/height 속성과 aspectRatio 로 자리를 먼저 잡아 두면
            로드 전후로 캔버스 높이가 변하지 않는다. */}
        {attrs.src ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={attrs.src}
            alt={attrs.alt || "상품 상세 이미지"}
            width={attrs.width}
            height={attrs.height}
            draggable={false}
            onLoad={onImageLoad}
            className={FLOW.image}
            style={{ aspectRatio: `${attrs.width} / ${attrs.height}` }}
          />
        ) : (
          /* src 가 비면 <img src=""> 가 되어 브라우저가 현재 주소를 다시 받아 오고
             콘솔에 오류가 남는다. 올리기가 끝나기 전 잠깐 이 상태가 될 수 있다. */
          <div
            className="flex items-center justify-center text-[12px] text-ink-400"
            style={{ aspectRatio: `${attrs.width} / ${attrs.height}` }}
          >
            사진을 불러오는 중
          </div>
        )}

        {selected && (
          <>
            {/* 손잡이는 사진 높이 전체를 덮는 얇은 띠다. 상세 통이미지는 4000px 도
                되기 때문에, 가운데 한 점에 손잡이를 두면 화면 밖으로 나가 잡을 수 없다.
                도구 막대의 끌기 손잡이(GripVertical)와는 다른 물건이다 — 이쪽은
                **폭만** 바꾼다. 그래서 순서 드래그는 여기서 계속 막는다. */}
            {(["left", "right"] as const).map((side) => (
              <div
                key={side}
                role="separator"
                aria-orientation="vertical"
                aria-label={side === "left" ? "왼쪽 가장자리 — 끌어서 크기 바꾸기" : "오른쪽 가장자리 — 끌어서 크기 바꾸기"}
                draggable={false}
                // detailImage 는 draggable 노드다. 손잡이를 잡는 순간 브라우저가
                // 블록 옮기기 드래그로 알아들으면 반투명 유령 이미지가 따라다니며
                // 폭 조절이 통째로 망가진다 — 여기서만 그 길을 막는다.
                onDragStart={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onPointerDown={(e) => beginDrag(e, side)}
                onPointerMove={onDragMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                contentEditable={false}
                className={`absolute inset-y-0 z-20 flex w-4 cursor-ew-resize justify-center ${
                  side === "left" ? "-left-2" : "-right-2"
                }`}
                // 모바일/펜에서 브라우저가 스크롤로 가로채지 못하게 한다
                style={{ touchAction: "none" }}
              >
                <span
                  aria-hidden
                  className={`h-full w-[3px] transition-colors ${
                    dragging === side ? "bg-forest-700" : "bg-forest-600"
                  }`}
                />
              </div>
            ))}

            {dragging && (
              <span
                ref={badgeRef}
                aria-hidden
                className="krw pointer-events-none absolute left-1/2 z-30 -translate-x-1/2 -translate-y-1/2 bg-ink-900 px-2 py-1 text-[11px] font-medium text-cream-50"
              >
                {Math.round(attrs.widthPct)}%
              </span>
            )}
          </>
        )}
      </div>

      {selected && !dragging && (
        <DetailImageToolbar
          align={attrs.align}
          widthPct={attrs.widthPct}
          onAlign={setAlign}
          onWidth={setWidth}
          onCrop={requestCrop}
          onDelete={deleteNode}
        />
      )}
    </NodeViewWrapper>
  );
}
