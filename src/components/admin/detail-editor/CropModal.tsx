"use client";

/* ============================================================
   상세 이미지 자르기 — 편집 캔버스에서 그림 한 장을 다시 잘라 굽는다.

   ── 왜 언제나 '원본'을 자르는가 ──
   크롭은 CSS 흉내가 아니라 새 파일로 굽는다(SPEC §5.5). 그런데 다음 번에 그 **구워진
   결과**를 다시 자르면 WebP 재인코딩이 한 번 더 얹히고, 이미 줄어든 그림을 또 줄이게
   된다. 두세 번만 반복해도 화질이 계단식으로 떨어진다. 그래서 노드에 남겨 둔
   sourceUrl(크롭 전 원본)이 있으면 **항상 그쪽을** 내려받아 자르고, 결과에도 같은
   sourceUrl 을 그대로 돌려준다. 몇 번을 다시 잘라도 원본에서 한 번 자른 화질이 나온다.

   ── 좌표는 원본 픽셀로만 들고 있는다 ──
   보이는 그림은 모달 크기에 맞춰 축소돼 있고, 창을 줄이면 그 배율이 또 바뀐다. 화면
   좌표를 저장하면 창 크기에 따라 잘리는 자리가 달라진다. 그래서 선택 사각형은 **원본
   픽셀** 로만 보관하고 표시할 때만 원본 대비 %로 환산해 얹는다. 포인터 이동량은 받는
   즉시 표시 배율(표시폭/원본폭)로 나눠 원본 픽셀로 되돌린다.
   사각형 수학 자체는 DOM 을 모르는 crop-geometry.ts 에 있다 — 이 파일은 "언제 재고
   어디에 그리는가" 만 다룬다. (같은 갈래: detail-editor/resize-math.ts)
   ============================================================ */

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Loader2, X } from "lucide-react";
import Modal from "@/components/admin/Modal";
import { uploadProcessedImage } from "@/lib/admin-upload";
import {
  DETAIL_SLICE_HEIGHT,
  GALLERY_MAX_EDGE,
  cropImage,
  readImageMeta,
} from "@/lib/image-pipeline";
import {
  RATIOS,
  cropOutputSize,
  describeCrop,
  recenterToRatio,
  resolveRect,
  type Handle,
  type OutputCaps,
  type Rect,
} from "./crop-geometry";

export interface CropResult {
  url: string;
  width: number;
  height: number;
  /** 다음 번 자르기가 다시 시작할 원본 */
  sourceUrl: string;
}

export interface CropModalProps {
  open: boolean;
  /** 지금 문서에 들어 있는 그림 */
  src: string;
  /** 크롭 전 원본 — 있으면 언제나 이쪽을 자른다 */
  sourceUrl?: string | null;
  onClose: () => void;
  onCropped: (result: CropResult) => void;
  /** 업로드 경로 앞머리 (상품 폴더) */
  uploadPrefix: string;
}

/* 자른 결과에 씌우는 상한. **긴 변 하나로 재지 않는다** — 그러면 세로로 긴 상세 조각의
   폭이 반토막 난다(자세한 이유는 crop-geometry 의 cropOutputSize 머리말).
   · 폭 2,000 = 이 편집기에 들어오는 그림 중 가장 넓은 것(상품컷, 긴 변 GALLERY_MAX_EDGE)과
     같은 값이라, 정상적으로 올라온 사진이면 폭이 한 픽셀도 깎이지 않는다.
   · 높이 4,000 = 상세 조각 한 장의 세로 상한(DETAIL_SLICE_HEIGHT)과 같은 값이라, 조각을
     통째로 잘라도 그대로 남는다. 조각내기 전 원본(세로 1만 px 이상)이 섞여 들어왔을 때만
     걸리며, 그때는 업로드 상한(4MB)과 캔버스 한계를 넘지 않게 막아 주는 안전판이 된다. */
const OUTPUT_CAPS: OutputCaps = { width: GALLERY_MAX_EDGE, height: DETAIL_SLICE_HEIGHT };

/* 손잡이 — 변 4개는 얇은 띠, 모서리 4개는 그 위에 얹는다(뒤에 오는 것이 위로 쌓인다) */
const CORNER_CLS = "h-3.5 w-3.5 border border-cream-50 bg-forest-700 ";
const HANDLES: { h: Handle; corner?: true; cls: string }[] = [
  { h: "n", cls: "left-0 top-0 h-2 w-full -translate-y-1/2 cursor-ns-resize" },
  { h: "s", cls: "bottom-0 left-0 h-2 w-full translate-y-1/2 cursor-ns-resize" },
  { h: "w", cls: "left-0 top-0 h-full w-2 -translate-x-1/2 cursor-ew-resize" },
  { h: "e", cls: "right-0 top-0 h-full w-2 translate-x-1/2 cursor-ew-resize" },
  { h: "nw", corner: true, cls: "left-0 top-0 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize" },
  { h: "ne", corner: true, cls: "right-0 top-0 translate-x-1/2 -translate-y-1/2 cursor-nesw-resize" },
  { h: "sw", corner: true, cls: "bottom-0 left-0 -translate-x-1/2 translate-y-1/2 cursor-nesw-resize" },
  { h: "se", corner: true, cls: "bottom-0 right-0 translate-x-1/2 translate-y-1/2 cursor-nwse-resize" },
];

type Phase = "loading" | "ready" | "cropping" | "uploading" | "failed";

/**
 * 드래그 한 번 동안 변하지 않는 것들.
 * scale 은 화면 이동량을 원본 픽셀로 되돌리는 나눗수, scrollTop 은 그 사이 크롭 면이
 * 스크롤됐을 때 그만큼을 보태 주기 위한 시작 위치다.
 */
type DragState = {
  handle: Handle;
  from: Rect;
  x: number;
  y: number;
  scale: number;
  scrollTop: number;
};

export default function CropModal({
  open,
  src,
  sourceUrl,
  onClose,
  onCropped,
  uploadPrefix,
}: CropModalProps) {
  /** 자를 대상 — 원본이 남아 있으면 언제나 원본 (머리말 참고) */
  const originUrl = sourceUrl && sourceUrl.trim() ? sourceUrl : src;

  const [phase, setPhase] = useState<Phase>("loading");
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [ratio, setRatio] = useState<number | null>(null);
  /** 손을 뗄 때만 갱신되는 '확정된' 사각형 — 드래그 중에는 rectRef 만 움직인다 */
  const [rect, setRect] = useState<Rect>({ x: 0, y: 0, w: 1, h: 1 });

  const blobRef = useRef<Blob | null>(null);
  const naturalRef = useRef<{ w: number; h: number } | null>(null);
  const rectRef = useRef<Rect>({ x: 0, y: 0, w: 1, h: 1 });
  const dragRef = useRef<DragState | null>(null);
  const rafRef = useRef(0);
  /** 자르기·올리기가 도는 중인지. 상태가 아니라 ref 인 이유는 apply() 재진입 가드에 있다 */
  const runningRef = useRef(false);

  const imgRef = useRef<HTMLImageElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const shadeRefs = useRef<(HTMLDivElement | null)[]>([]);
  const sizeRef = useRef<HTMLSpanElement>(null);

  const busy = phase === "cropping" || phase === "uploading";
  /** 사진이 화면에 떠 있는가 — 치수 문구를 띄울지만 판단한다 */
  const loaded = phase === "ready" || busy;
  /* 조작을 받아도 되는가. **busy 를 여기 포함시키지 않는 것이 핵심이다** — 전에는
     "ready || busy" 를 버튼 조건으로 써서 올리는 중에도 「이대로 자르기」가 눌렸고,
     두 번 누르면 같은 사진이 두 번 올라가 onCropped 도 두 번 불렸다. 비율 버튼도
     마찬가지라, 저장 중에 비율을 바꾸면 관리자가 마지막으로 본 영역이 저장된다는
     보장이 사라진다(apply 는 시작 시점의 사각형을 들고 간다). */
  const idle = phase === "ready";

  /* 열고 닫을 때의 초기화는 effect 가 아니라 렌더 중 비교로 한다 — 이 저장소의
     ImageCropper 와 같은 방식이다. effect 로 하면 렌더가 한 번 더 돌면서 첫 프레임에
     지난번 사진이 잠깐 보인다. */
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    setPhase("loading");
    setPreviewUrl(null);
    setError(null);
    setRatio(null);
  }

  /**
   * 사각형을 DOM 에 직접 그린다. **드래그 중에는 setState 를 하지 않는다** —
   * 포인터 이벤트마다 리렌더를 돌리면 큰 그림에서 눈에 띄게 끊긴다(SPEC §5.4와 같은 이유).
   * 값은 원본 대비 %라 창 크기가 바뀌어도 다시 계산할 필요가 없다.
   */
  const paint = useCallback(() => {
    const nat = naturalRef.current;
    const box = boxRef.current;
    if (!nat || !box) return;
    const r = rectRef.current;
    const px = (v: number) => `${(v / nat.w) * 100}%`;
    const py = (v: number) => `${(v / nat.h) * 100}%`;

    Object.assign(box.style, { left: px(r.x), top: py(r.y), width: px(r.w), height: py(r.h) });

    /* 바깥을 네 장으로 덮는다. 한 장에 clip-path 로 구멍을 뚫는 방법도 있지만
       가장자리 반올림이 브라우저마다 달라 1px 짜리 밝은 선이 남는다. */
    [
      { left: "0%", top: "0%", width: "100%", height: py(r.y) },
      { left: "0%", top: py(r.y + r.h), width: "100%", height: py(nat.h - r.y - r.h) },
      { left: "0%", top: py(r.y), width: px(r.x), height: py(r.h) },
      { left: px(r.x + r.w), top: py(r.y), width: px(nat.w - r.x - r.w), height: py(r.h) },
    ].forEach((style, i) => {
      const el = shadeRefs.current[i];
      if (el) Object.assign(el.style, style);
    });

    if (sizeRef.current) sizeRef.current.textContent = describeCrop(r.w, r.h, OUTPUT_CAPS);
  }, []);

  /** 포인터 이벤트를 한 프레임에 하나로 합친다 */
  const schedule = useCallback(() => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      paint();
    });
  }, [paint]);

  /* 열릴 때마다 원본을 Blob 으로 받아 둔다. createImageBitmap 은 File|Blob 만 받아서 URL 을
     그대로 넘길 수 없고, 화면에도 이 Blob 을 띄워야 '고른 자리' 와 '잘리는 자리' 가 같은
     그림 위에서 일치한다. */
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    let made: string | null = null;

    void (async () => {
      try {
        const res = await fetch(originUrl);
        if (!res.ok) throw new Error("원본 사진을 불러오지 못했습니다.");
        const blob = await res.blob();
        const meta = await readImageMeta(blob);
        if (cancelled) return;

        made = URL.createObjectURL(blob);
        blobRef.current = blob;
        naturalRef.current = { w: meta.width, h: meta.height };
        // 처음에는 그림 전체를 고른 상태로 둔다 — 대개 가장자리만 다듬으러 들어온다
        rectRef.current = { x: 0, y: 0, w: meta.width, h: meta.height };
        setRect(rectRef.current);
        setPreviewUrl(made);
        setPhase("ready");
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "원본 사진을 불러오지 못했습니다.");
        setPhase("failed");
      }
    })();

    return () => {
      cancelled = true;
      naturalRef.current = null;
      blobRef.current = null;
      if (made) URL.revokeObjectURL(made);
    };
  }, [open, originUrl]);

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);
  // 상태가 바뀐 뒤(첫 그림·프리셋·손 뗀 뒤)에는 여기서 한 번 그린다
  useEffect(paint, [paint, rect, previewUrl]);

  /**
   * setPointerCapture 로 포인터를 손잡이에 묶는다 — 빠르게 끌어 손잡이 밖으로 나가도
   * 이벤트가 계속 들어온다. 이걸 빠뜨리면 그림 밖으로 나가는 순간 드래그가 끊긴다.
   * 이후 이동·종료는 바깥 상자에서 받는다(잡힌 포인터의 이벤트도 위로 올라온다).
   */
  function beginDrag(e: React.PointerEvent<HTMLElement>, handle: Handle) {
    const nat = naturalRef.current;
    const shownRect = imgRef.current?.getBoundingClientRect();
    if (!nat || !shownRect || !idle) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    dragRef.current = {
      handle,
      from: rectRef.current,
      x: e.clientX,
      y: e.clientY,
      scale: shownRect.width > 0 ? shownRect.width / nat.w : 1,
      scrollTop: scrollRef.current?.scrollTop ?? 0,
    };
  }

  /* ratio 는 상태를 그대로 읽는다 — 이 함수는 렌더마다 새로 만들어지고, 드래그 도중에는
     리렌더가 없으므로 잡은 순간의 비율이 끝까지 유지된다. */
  function moveDrag(e: React.PointerEvent<HTMLElement>) {
    const d = dragRef.current;
    const nat = naturalRef.current;
    if (!d || !nat) return;
    /* 끄는 도중 크롭 면이 스크롤되면(휠·트랙패드) 그림이 포인터 밑에서 움직인다.
       clientY 차이만 보면 그만큼이 통째로 누락돼 상자가 그림과 어긋난 채 따라온다. */
    const scrolled = (scrollRef.current?.scrollTop ?? 0) - d.scrollTop;
    const dx = (e.clientX - d.x) / d.scale;
    const dy = (e.clientY - d.y + scrolled) / d.scale;
    rectRef.current = resolveRect(d.from, d.handle, dx, dy, nat.w, nat.h, ratio);
    schedule();
  }

  function endDrag() {
    if (!dragRef.current) return;
    dragRef.current = null;
    setRect(rectRef.current); // 커밋은 손을 뗄 때 한 번만
  }

  function pickRatio(next: number | null) {
    setRatio(next);
    const nat = naturalRef.current;
    if (next == null || !nat) return;
    rectRef.current = recenterToRatio(rectRef.current, next, nat.w, nat.h);
    setRect(rectRef.current);
  }

  async function apply() {
    const blob = blobRef.current;
    /* 재진입 가드 — 버튼 disabled 는 리렌더가 한 번 돌아야 걸린다. 그 사이에 두 번
       눌리면 같은 사진이 두 번 올라가고 onCropped·onClose 도 두 번 불린다. */
    if (!blob || !naturalRef.current || runningRef.current) return;
    runningRef.current = true;
    const r = rectRef.current;

    setError(null);
    setPhase("cropping");
    try {
      /* 상한을 폭·높이로 따로 걸고 그 결과가 나오도록 maxEdge 를 역산해 넘긴다.
         cropImage 에 GALLERY_MAX_EDGE 를 그대로 주면 1,080×4,000 조각이 540×2,000 으로
         반토막 나기 때문이다(crop-geometry 의 cropOutputSize 머리말). */
      const cropped = await cropImage(
        blob,
        { x: r.x, y: r.y, width: r.w, height: r.h },
        { maxEdge: cropOutputSize(r.w, r.h, OUTPUT_CAPS).maxEdge, quality: 0.92 }
      );

      setPhase("uploading");
      /* 여기서 uploadGalleryImage 를 쓰면 안에서 긴 변 2,000 상한이 한 번 더 걸려
         방금 지켜 낸 폭이 도로 깎인다. 이미 규격을 맞췄으니 전송만 하는 쪽을 쓴다. */
      const asset = await uploadProcessedImage(cropped, {
        prefix: uploadPrefix,
        filename: "crop.webp",
      });

      /* 돌려주는 치수는 **올라간 파일의 실제 치수** 다. 문서의 width/height 가 이것과
         어긋나면 렌더 쪽이 잘못된 종횡비로 자리를 잡아 그림이 눌려 보인다. */
      onCropped({
        url: asset.url,
        width: asset.width,
        height: asset.height,
        sourceUrl: originUrl,
      });
      onClose();
    } catch (e) {
      // 실패해도 닫지 않는다 — 닫아 버리면 고른 영역이 사라져 처음부터 다시 해야 한다
      setError(e instanceof Error ? e.message : "사진을 자르지 못했습니다.");
      setPhase("ready");
    } finally {
      runningRef.current = false;
    }
  }

  return (
    <Modal
      open={open}
      onClose={busy ? () => undefined : onClose}
      title="사진 자르기"
      size="lg"
      /* 버튼을 본문이 아니라 모달 발판에 둔다 — 세로로 긴 사진에서는 본문이 길어져
         「이대로 자르기」가 화면 밖으로 밀려나기 때문이다. 발판은 늘 붙어 있다. */
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="inline-flex items-center gap-1.5 border border-ink-200 px-4 py-2 text-sm text-ink-600 transition-colors hover:bg-cream-100 disabled:opacity-50"
          >
            <X size={15} strokeWidth={1.5} />
            그만두기
          </button>
          <button
            type="button"
            onClick={() => void apply()}
            disabled={!idle}
            className="inline-flex items-center gap-1.5 bg-forest-700 px-4 py-2 text-sm text-cream-50 transition-colors hover:bg-forest-800 disabled:opacity-50"
          >
            {busy ? (
              <Loader2 size={15} strokeWidth={1.5} className="animate-spin" />
            ) : (
              <Check size={15} strokeWidth={1.5} />
            )}
            {phase === "cropping" ? "자르는 중…" : phase === "uploading" ? "올리는 중…" : "이대로 자르기"}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {RATIOS.map(([label, value]) => (
            <button
              key={label}
              type="button"
              onClick={() => pickRatio(value)}
              disabled={!idle}
              aria-pressed={ratio === value}
              className={`border px-3 py-1.5 text-xs transition-colors disabled:opacity-40 ${
                ratio === value
                  ? "border-forest-700 bg-forest-700 text-cream-50"
                  : "border-ink-200 text-ink-600 hover:border-forest-600 hover:text-forest-700"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* 오류는 크롭 면 **위**에 둔다 — 아래에 두면 긴 사진에서 접혀 보이지 않는다 */}
        {error && <p className="text-center text-xs text-signal-red">{error}</p>}

        {phase === "loading" && (
          <p className="flex items-center justify-center gap-2 py-16 text-xs text-ink-400">
            <Loader2 size={14} strokeWidth={1.5} className="animate-spin" />
            원본 사진을 불러오는 중…
          </p>
        )}

        {previewUrl && (
          /* 높이가 아니라 **폭**에 맞추고, 넘치는 만큼은 이 칸 안에서 스크롤한다.
             전에는 max-h 로 높이에 맞췄는데, 그러면 세로로 긴 그림일수록 폭까지 같이
             졸아든다 — 이 편집기의 주력인 1,080×4,000 조각이 131×486 으로 그려져
             (적대 검수 실측) 포인터 1px 이 원본 8px 이 됐고, 그 배율로는 '가장자리만
             다듬는' 조작이 불가능했다. 폭에 맞추면 같은 그림이 모달 폭(704px)만큼
             벌어져 포인터 1px 이 원본 1.5px 이 된다.
             60vh 는 모달의 머리·발판·여백을 뺀 나머지에 맞춘 값이다. 더 키우면 모달
             본문에도 스크롤이 생겨 스크롤이 두 겹이 되고, overscroll-contain 때문에
             바깥쪽을 굴릴 방법이 마땅치 않아진다.
             안쪽 여백은 가장자리에 걸친 손잡이(±7px)가 잘리지 않게 두는 것이다. */
          <div
            ref={scrollRef}
            className="max-h-[60vh] overflow-y-auto overscroll-contain px-3 py-3"
          >
            <div className="relative mx-auto w-fit select-none">
              {/* 원본 비율 그대로 띄워야 고른 자리와 잘리는 자리가 어긋나지 않는다.
                  next/image 를 태우면 표시 치수를 우리가 통제할 수 없다. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                ref={imgRef}
                src={previewUrl}
                alt=""
                draggable={false}
                onLoad={paint}
                className="block h-auto w-auto max-w-full"
              />

              {/* 고른 자리 밖은 덮어 무엇이 남는지 보이게 한다 */}
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  ref={(el) => void (shadeRefs.current[i] = el)}
                  aria-hidden
                  className="pointer-events-none absolute bg-forest-950/50"
                />
              ))}

              <div
                ref={boxRef}
                onPointerDown={(e) => beginDrag(e, "move")}
                onPointerMove={moveDrag}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                className="absolute cursor-move touch-none border border-cream-50"
              >
                {HANDLES.map((k) => (
                  <span
                    key={k.h}
                    role="presentation"
                    onPointerDown={(e) => beginDrag(e, k.h)}
                    className={`absolute touch-none ${k.corner ? CORNER_CLS : ""}${k.cls}`}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        <p className="text-center text-xs text-ink-400">
          모서리와 변을 끌어 크기를, 안쪽을 끌어 자리를 정하세요
          {loaded && (
            <>
              {" · "}
              <span ref={sizeRef} className="tabular-nums text-ink-600" />
            </>
          )}
        </p>
      </div>
    </Modal>
  );
}
