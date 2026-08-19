"use client";

/* ============================================================
   "이어붙는 슬라이스" 판정 — 편집 캔버스의 세로 모양을 고객 화면과 맞춘다

   고객 화면(DetailDocRenderer 의 isSeamless/chunkFlow)은 **폭 100% · 가운데 정렬**
   이미지가 연달아 오면 한 덩어리로 묶어 테두리를 한 번만 두르고, 슬라이스 사이
   간격을 0 으로 그린다. 운영 상품의 상세는 거의 전부 통이미지를 잘라 붙인
   100%/center 슬라이스다.

   편집 캔버스는 이 사실을 모르면 사진마다 테두리를 두르고 본문 리듬(space-y)까지
   끼워 넣어 **줄무늬로 끊긴 그림**을 보여 준다. 폭(G1-a)은 맞는데 세로가 어긋나는
   것이라, "지금 보는 것이 곧 고객이 볼 것" 이라는 이 편집기의 존재 이유가 깨진다.

   ── 왜 노드뷰가 직접 못 하는가 ──
   노드뷰는 자기 노드만 props 로 받는다. 위/아래 이웃이 바뀌어도(예: 위 사진의 폭을
   50% 로 줄여도) 내 props 는 그대로라 다시 그려지지 않는다. 그래서 이웃 판정은
   props 가 아니라 **트랜잭션**에 붙는다 — 문서가 바뀔 때마다 다시 본다.
   ============================================================ */

import { useEffect, useState } from "react";
import type { Editor } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";

/**
 * 고객 렌더러의 `isSeamless` 와 **같은 판정**이어야 한다.
 * 한쪽만 바뀌면 편집기와 고객 화면이 다시 갈라진다 — 바꿀 일이 생기면 둘을 같이 본다.
 */
export function isSeamlessNode(node: PMNode | null | undefined): boolean {
  if (!node || node.type.name !== "detailImage") return false;
  return Number(node.attrs.widthPct) === 100 && node.attrs.align === "center";
}

export interface SeamlessJoin {
  /** 바로 위 슬라이스와 이어진다 — 맞닿는 위 테두리와 사이 여백을 지운다 */
  prev: boolean;
  /** 바로 아래 슬라이스와 이어진다 — 맞닿는 아래 테두리와 사이 여백을 지운다 */
  next: boolean;
}

const APART: SeamlessJoin = { prev: false, next: false };

function readJoin(editor: Editor, getPos: () => number | undefined): SeamlessJoin {
  const pos = getPos();
  if (typeof pos !== "number") return APART;
  try {
    const { doc } = editor.state;
    const $before = doc.resolve(pos);
    const self = $before.nodeAfter;
    if (!self) return APART;
    return {
      prev: isSeamlessNode($before.nodeBefore),
      next: isSeamlessNode(doc.resolve(pos + self.nodeSize).nodeAfter),
    };
  } catch {
    /* 트랜잭션 도중 위치가 잠깐 문서 밖을 가리킬 수 있다.
       다음 트랜잭션에서 다시 맞춰지므로 이번 판정만 포기한다. */
    return APART;
  }
}

/**
 * 이 노드가 위/아래 이웃과 한 덩어리로 이어지는가.
 * `seamless` 가 거짓이면(폭이 100% 가 아니거나 가운데 정렬이 아니면) 언제나 떨어진다 —
 * 관리자가 일부러 따로 배치한 사진이라는 뜻이기 때문이다.
 */
export function useSeamlessJoin(
  editor: Editor,
  getPos: () => number | undefined,
  seamless: boolean
): SeamlessJoin {
  const [join, setJoin] = useState<SeamlessJoin>(APART);

  useEffect(() => {
    const sync = () => {
      const next = seamless ? readJoin(editor, getPos) : APART;
      // 값이 그대로면 상태를 갈지 않는다 — 사진 30장이면 트랜잭션마다 30번 불린다
      setJoin((cur) => (cur.prev === next.prev && cur.next === next.next ? cur : next));
    };
    sync();
    editor.on("transaction", sync);
    return () => {
      editor.off("transaction", sync);
    };
  }, [editor, getPos, seamless]);

  return join;
}
