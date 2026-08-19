"use client";

/* ============================================================
   사진 자르기·돌리기 — 관리자가 포토샵을 열지 않아도 되도록.

   지금까지는 상품컷을 올리기 전에 관리자가 밖에서 잘라 와야 했다.
   갤러리는 정사각에 가까운 상품컷을 전제로 하는데(세로로 긴 사진이 섞이면
   썸네일 스트립이 무너진다 — scripts/fix_tall_gallery_images.mjs 사고 참고),
   자르는 수단이 화면에 없으니 사고를 막을 방법도 없었다.

   좌표는 화면 픽셀이 아니라 **보이는 그림 대비 비율(0~1)** 로 들고 있는다.
   그래야 창 크기가 바뀌어도 선택 영역이 그대로고, 적용할 때 원본 픽셀로 정확히 환산된다.

   ── 회전을 CSS 로 하지 않는 이유 (실제로 났던 버그) ──
   처음에는 `<img style="transform: rotate(90deg)">` 로 돌려 보여 주고, 자를 때는
   회전 전 원본 좌표로 계산했다. 그러면 90°/270° 에서 **관리자가 고른 영역과 실제로 잘리는
   영역이 어긋난다** — 게다가 CSS 로 돌린 그림은 레이아웃 상자가 회전 전 크기 그대로라
   선택 사각형을 덮어씌우는 자리부터 이미 맞지 않았다.

   그래서 회전은 화면 효과가 아니라 **실제 그림으로** 만든다. 돌린 그림을 새로 그려서
   그대로 보여 주면 고르는 좌표계와 보이는 그림이 하나가 되어 어긋날 여지가 없다.
   미리보기는 매번 **원본에서** 다시 만든다(돌린 것을 또 돌리지 않는다) — 반복해서 돌려도
   화질이 깎이지 않는다. 실제 자르기는 고른 영역을 원본 좌표로 되돌려 원본에서 잘라내므로
   미리보기 해상도에 발목 잡히지 않는다.
   ============================================================ */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RotateCw, Check, X } from "lucide-react";
import Modal from "@/components/admin/Modal";
import { cropImage, humanBytes, readImageMeta, type CropRect } from "@/lib/image-pipeline";

export interface ImageCropperProps {
  open: boolean;
  /** 자를 원본 — File 이거나 이미 올라간 이미지의 URL */
  source: File | string | null;
  /** 잘라 낸 결과(WebP Blob)와 치수를 돌려준다 */
  onApply: (result: { blob: Blob; width: number; height: number }) => void | Promise<void>;
  onClose: () => void;
  title?: string;
}

/** 화면 비율 프리셋 — 이름은 쓰임새로 부른다 (숫자만 보이면 무엇에 쓰는지 알 수 없다) */
const RATIOS: { label: string; value: number | null; hint: string }[] = [
  { label: "자유롭게", value: null, hint: "원하는 대로" },
  { label: "정사각형", value: 1, hint: "목록 카드에 가장 잘 맞습니다" },
  { label: "세로 4:5", value: 4 / 5, hint: "인스타그램 세로" },
  { label: "가로 3:2", value: 3 / 2, hint: "넓은 연출컷" },
];

type Handle = "move" | "nw" | "ne" | "sw" | "se";

interface Frac {
  x: number;
  y: number;
  w: number;
  h: number;
}

const START: Frac = { x: 0.05, y: 0.05, w: 0.9, h: 0.9 };
const MIN = 0.06;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * 돌아간 그림에서 고른 사각형을 **원본 그림의 좌표**로 되돌린다.
 *
 * 시계방향 회전에서 원본 픽셀 (sx,sy) 는 이렇게 옮겨 간다:
 *    90°  → (H-1-sy, sx)     돌린 그림 크기 H×W
 *    180° → (W-1-sx, H-1-sy) 돌린 그림 크기 W×H
 *    270° → (sy, W-1-sx)     돌린 그림 크기 H×W
 * 아래는 그 역변환이다. 가로세로가 뒤바뀌는 90/270 에서는 폭과 높이도 서로 바꿔 준다.
 */
function toSourceRect(
  rect: CropRect,
  rotate: 0 | 90 | 180 | 270,
  sourceW: number,
  sourceH: number
): CropRect {
  const { x, y, width: w, height: h } = rect;
  if (rotate === 90) return { x: y, y: sourceH - x - w, width: h, height: w };
  if (rotate === 180) return { x: sourceW - x - w, y: sourceH - y - h, width: w, height: h };
  if (rotate === 270) return { x: sourceW - y - h, y: x, width: h, height: w };
  return rect;
}

export default function ImageCropper({
  open,
  source,
  onApply,
  onClose,
  title = "사진 자르기",
}: ImageCropperProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [frac, setFrac] = useState<Frac>(START);
  const [ratio, setRatio] = useState<number | null>(null);
  const [rotate, setRotate] = useState<0 | 90 | 180 | 270>(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const drag = useRef<{ mode: Handle; x: number; y: number; from: Frac } | null>(null);

  // File 은 화면에 띄우려면 임시 주소가 필요하다 — 렌더 중에 만들고 effect 로 회수한다.
  // (effect 안에서 만들어 setState 하면 렌더가 한 번 더 돌면서 첫 프레임에 사진이 비어 보인다)
  const objectUrl = useMemo(() => {
    if (!source) return null;
    return typeof source === "string" ? source : URL.createObjectURL(source);
  }, [source]);

  useEffect(() => {
    if (!objectUrl || typeof source === "string") return;
    return () => URL.revokeObjectURL(objectUrl);
  }, [objectUrl, source]);

  /**
   * 돌린 그림을 실제로 만들어 두는 자리. rotate 가 0 이면 원본을 그대로 쓴다.
   * 매번 **원본에서** 다시 만들기 때문에 여러 번 돌려도 화질이 누적으로 깎이지 않는다.
   */
  // 어느 각도로 돌린 그림인지 함께 들고 있는다 — 90°→270° 로 바꾸는 순간
  // 옛 그림이 잠깐 보이면 그 사이 고른 영역이 엉뚱한 좌표계로 잡힌다.
  const [rotated, setRotated] = useState<{ rotate: number; url: string } | null>(null);
  const [sourceSize, setSourceSize] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    if (!open || !source || rotate === 0) return;
    let cancelled = false;
    let made: string | null = null;
    (async () => {
      try {
        const blob = typeof source === "string" ? await (await fetch(source)).blob() : source;
        let size = sourceSize;
        if (!size) {
          const meta = await readImageMeta(blob);
          size = { w: meta.width, h: meta.height };
        }
        const turned = await cropImage(
          blob,
          { x: 0, y: 0, width: size.w, height: size.h },
          { rotate, maxEdge: 1600, quality: 0.9 }
        );
        if (cancelled) return;
        made = URL.createObjectURL(turned.blob);
        setRotated({ rotate, url: made });
      } catch {
        /* 돌리기에 실패하면 아래에서 shownUrl 이 null 이라 '준비 중' 상태로 남는다 */
      }
    })();
    return () => {
      cancelled = true;
      if (made) URL.revokeObjectURL(made);
    };
  }, [open, source, rotate, sourceSize]);

  /** 화면에 실제로 띄우는 그림 — 돌렸으면 '지금 각도로' 돌린 것만 쓴다 */
  const shownUrl =
    rotate === 0 ? objectUrl : rotated && rotated.rotate === rotate ? rotated.url : null;

  // 열릴 때마다 초기화 — effect 가 아니라 렌더 중 비교로 처리한다(연쇄 렌더 방지).
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setFrac(START);
      setRatio(null);
      setRotate(0);
      setError(null);
      setNatural(null);
      setSourceSize(null);
      setRotated(null);
    }
  }

  /** 비율을 고르면 현재 선택을 그 비율에 맞춰 가운데로 다시 잡는다 */
  const applyRatio = useCallback(
    (next: number | null) => {
      setRatio(next);
      if (next == null || !natural) return;
      // 비율은 "가로:세로" 이고, 프레임 좌표는 원본 대비 비율이라 원본 종횡비를 곱해 보정한다
      const imageRatio = natural.w / natural.h;
      let w = frac.w;
      let h = (w * imageRatio) / next;
      if (h > 1) {
        h = 1;
        w = (h * next) / imageRatio;
      }
      setFrac({ x: clamp(frac.x + (frac.w - w) / 2, 0, 1 - w), y: clamp(frac.y + (frac.h - h) / 2, 0, 1 - h), w, h });
    },
    [frac, natural]
  );

  const startDrag = useCallback(
    (e: React.PointerEvent, mode: Handle) => {
      e.preventDefault();
      e.stopPropagation();
      (e.target as Element).setPointerCapture?.(e.pointerId);
      drag.current = { mode, x: e.clientX, y: e.clientY, from: frac };
    },
    [frac]
  );

  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current;
    const box = boxRef.current;
    if (!d || !box) return;
    const rect = box.getBoundingClientRect();
    const dx = (e.clientX - d.x) / rect.width;
    const dy = (e.clientY - d.y) / rect.height;
    const f = d.from;

    if (d.mode === "move") {
      setFrac({ ...f, x: clamp(f.x + dx, 0, 1 - f.w), y: clamp(f.y + dy, 0, 1 - f.h) });
      return;
    }

    const east = d.mode === "ne" || d.mode === "se";
    const south = d.mode === "se" || d.mode === "sw";
    const w = clamp(east ? f.w + dx : f.w - dx, MIN, 1);
    let h = clamp(south ? f.h + dy : f.h - dy, MIN, 1);

    if (ratio != null && natural) {
      // 가로를 기준으로 세로를 끌어 맞춘다 — 두 축을 동시에 자유롭게 두면 비율이 흔들린다
      h = clamp((w * (natural.w / natural.h)) / ratio, MIN, 1);
    }

    const x = east ? f.x : clamp(f.x + (f.w - w), 0, 1 - w);
    const y = south ? f.y : clamp(f.y + (f.h - h), 0, 1 - h);
    setFrac({ x, y, w: Math.min(w, 1 - x), h: Math.min(h, 1 - y) });
  }

  function endDrag() {
    drag.current = null;
  }

  const outSize = natural
    ? {
        w: Math.round(natural.w * frac.w),
        h: Math.round(natural.h * frac.h),
      }
    : null;

  async function apply() {
    if (!source || !natural) return;
    setBusy(true);
    setError(null);
    try {
      const blob =
        typeof source === "string" ? await (await fetch(source)).blob() : source;
      // 화면에서 고른 영역은 '돌아간 그림' 기준이다. 원본에서 잘라내려면 되돌려야 한다 —
      // 이 환산을 빠뜨리면 90°/270° 에서 엉뚱한 데가 잘린다(파일 머리말 참고).
      let src = sourceSize;
      if (!src) {
        const meta = await readImageMeta(blob);
        src = { w: meta.width, h: meta.height };
      }
      const shownRect: CropRect = {
        x: natural.w * frac.x,
        y: natural.h * frac.y,
        width: natural.w * frac.w,
        height: natural.h * frac.h,
      };
      // 보이는 그림은 축소돼 있을 수 있으니, 돌아간 그림의 온전한 크기로 먼저 되돌린다
      const swap = rotate === 90 || rotate === 270;
      const fullShownW = swap ? src.h : src.w;
      const fullShownH = swap ? src.w : src.h;
      const scale = fullShownW / natural.w;
      const scaled: CropRect = {
        x: shownRect.x * scale,
        y: shownRect.y * scale,
        width: shownRect.width * scale,
        height: (shownRect.height * fullShownH) / natural.h,
      };
      const rect = toSourceRect(scaled, rotate, src.w, src.h);
      const result = await cropImage(blob, rect, { rotate });
      await onApply(result);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "사진을 자르지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={title} size="lg">
      <div className="space-y-4">
        {/* 비율 고르기 */}
        <div className="flex flex-wrap gap-2">
          {RATIOS.map((r) => (
            <button
              key={r.label}
              type="button"
              onClick={() => applyRatio(r.value)}
              title={r.hint}
              aria-pressed={ratio === r.value}
              className={`border px-3 py-1.5 text-xs transition-colors ${
                ratio === r.value
                  ? "border-forest-700 bg-forest-700 text-cream-50"
                  : "border-ink-200 text-ink-600 hover:border-forest-600 hover:text-forest-700"
              }`}
            >
              {r.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setRotate((v) => ((v + 90) % 360) as 0 | 90 | 180 | 270)}
            className="inline-flex items-center gap-1.5 border border-ink-200 px-3 py-1.5 text-xs text-ink-600 transition-colors hover:border-forest-600 hover:text-forest-700"
          >
            <RotateCw size={14} strokeWidth={1.5} />
            오른쪽으로 돌리기
          </button>
        </div>

        {/* 자를 영역 고르기 */}
        <div
          ref={boxRef}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerLeave={endDrag}
          className="relative mx-auto max-h-[52vh] w-fit touch-none select-none overflow-hidden bg-ink-900"
        >
          {shownUrl && (
            // 원본 비율 그대로 띄워야 선택 영역 환산이 맞는다 — next/image 최적화를 태우지 않는다
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={shownUrl}
              alt=""
              onLoad={(e) => {
                const w = e.currentTarget.naturalWidth;
                const h = e.currentTarget.naturalHeight;
                setNatural({ w, h });
                // 돌리기 전 원본 크기는 한 번만 기억해 둔다 — 되돌릴 때 기준이 된다
                if (rotate === 0) setSourceSize({ w, h });
              }}
              className="max-h-[52vh] w-auto max-w-full object-contain"
              draggable={false}
            />
          )}

          {/* 바깥쪽 어둡게 */}
          <div className="pointer-events-none absolute inset-0 bg-ink-900/55" />
          <div
            onPointerDown={(e) => startDrag(e, "move")}
            className="absolute cursor-move border-2 border-cream-50 shadow-[0_0_0_9999px_rgba(0,0,0,0.0)]"
            style={{
              left: `${frac.x * 100}%`,
              top: `${frac.y * 100}%`,
              width: `${frac.w * 100}%`,
              height: `${frac.h * 100}%`,
              boxShadow: "0 0 0 9999px rgba(24,24,24,0.55)",
            }}
          >
            {(["nw", "ne", "sw", "se"] as const).map((corner) => (
              <span
                key={corner}
                onPointerDown={(e) => startDrag(e, corner)}
                role="presentation"
                className={`absolute h-4 w-4 border-2 border-cream-50 bg-forest-700 ${
                  corner === "nw"
                    ? "-left-2 -top-2 cursor-nwse-resize"
                    : corner === "ne"
                      ? "-right-2 -top-2 cursor-nesw-resize"
                      : corner === "sw"
                        ? "-bottom-2 -left-2 cursor-nesw-resize"
                        : "-bottom-2 -right-2 cursor-nwse-resize"
                }`}
              />
            ))}
          </div>
        </div>

        <p className="text-center text-xs text-ink-400">
          모서리를 끌어 크기를, 안쪽을 끌어 위치를 정하세요.
          {outSize && (
            <>
              {" · "}
              <span className="krw">
                {outSize.w.toLocaleString("ko-KR")} × {outSize.h.toLocaleString("ko-KR")}
              </span>
              {typeof source !== "string" && source ? ` · 원본 ${humanBytes(source.size)}` : ""}
            </>
          )}
        </p>

        {error && <p className="text-center text-xs text-signal-red">{error}</p>}

        <div className="flex justify-end gap-2 border-t border-ink-100 pt-4">
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
            disabled={busy || !natural}
            className="inline-flex items-center gap-1.5 bg-forest-700 px-4 py-2 text-sm text-cream-50 transition-colors hover:bg-forest-800 disabled:opacity-50"
          >
            <Check size={15} strokeWidth={1.5} />
            {busy ? "자르는 중…" : "이대로 자르기"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
