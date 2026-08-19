"use client";

/* ============================================================
   상세페이지 편집기 — 조립부

   이 파일은 새로 만드는 것이 거의 없다. 스키마(extensions), 실측 캔버스(EditorStage),
   폭 드래그(DetailImageView), 서식 툴바(EditorToolbar), 자르기(CropModal),
   사진 반입(useImageUpload)을 하나로 엮는 것이 전부다.

   ── 이 화면이 존재하는 이유 ──
   전에는 관리자가 「고객 화면으로 보기」를 눌러도 상세 이미지가 1,066px 폭으로 그려졌다.
   고객이 실제로 보는 폭은 PC 766px · 모바일 348px 이다. 1.4~3.1배 확대된 화면에서
   "이 정도면 되겠지" 하고 만든 페이지가 고객 화면에서 전혀 다르게 보였다.
   그래서 미리보기를 고치는 대신 **편집 자체를 고객 폭 위에서** 하게 바꿨다.
   지금 보고 있는 것이 곧 고객이 볼 것이다.
   ============================================================ */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EditorContent, ReactNodeViewRenderer, useEditor } from "@tiptap/react";
import { UploadCloud } from "lucide-react";
import { FLOW } from "@/components/catalog/detail-prose";
import { renumberImages, type DetailDoc } from "@/lib/detail-doc-v2";
import CropModal, { type CropResult } from "./CropModal";
import DetailImageView, {
  CROP_REQUEST_EVENT,
  type CropRequestDetail,
} from "./DetailImageView";
import EditorStage from "./EditorStage";
import EditorToolbar from "./EditorToolbar";
import { buildExtensions } from "./extensions";
import type { StageViewport } from "./stage-context";
import { docToTiptap, tiptapToDoc } from "./tiptap-bridge";
import { useImageUpload } from "./useImageUpload";

export interface DetailEditorProps {
  doc: DetailDoc;
  onChange: (doc: DetailDoc) => void;
  /** 사진 설명 번호매김에 쓰는 상품명 */
  productName: string;
  /** 업로드 경로 접두어 (상품 id 또는 임시 초안 id) */
  uploadPrefix: string;
  /** 다른 탭에서 "상세페이지로 보내기" 로 넘어온 파일 */
  intake?: { id: number; files: File[] } | null;
  onIntakeDone?: () => void;
}

export default function DetailEditor({
  doc,
  onChange,
  productName,
  uploadPrefix,
  intake,
  onIntakeDone,
}: DetailEditorProps) {
  const [viewport, setViewport] = useState<StageViewport>("pc");
  const [crop, setCrop] = useState<CropRequestDetail | null>(null);
  const [dropping, setDropping] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const { ingest, progress, errors, clearErrors } = useImageUpload({ uploadPrefix });

  /* onChange·productName 을 ref 로 들고 있는 이유:
     useEditor 의 onUpdate 는 편집기를 만들 때 한 번 잡힌다. 부모가 매 렌더마다 새 함수를
     넘기면(흔한 일이다) 옛 클로저가 남아 "몇 글자 전" 문서를 올리게 된다.

     대입은 **렌더 중이 아니라 effect 안에서** 한다. 렌더 중 ref 를 건드리면
     같은 렌더가 두 번 돌 때(StrictMode·동시성 렌더) 값이 어긋날 수 있다. */
  const onChangeRef = useRef(onChange);
  const productNameRef = useRef(productName);
  useEffect(() => {
    onChangeRef.current = onChange;
    productNameRef.current = productName;
  }, [onChange, productName]);

  /* 우리가 마지막으로 올려 보낸 문서. 부모가 돌려주는 doc 이 이것과 같으면
     "내가 방금 친 글이 되돌아온 것" 이므로 편집기를 건드리지 않는다. */
  const emittedRef = useRef<string | null>(null);

  const extensions = useMemo(
    () => buildExtensions({ imageNodeView: ReactNodeViewRenderer(DetailImageView) }),
    []
  );

  /* 편집기를 만들 때 쓸 최초 내용.
     의도적으로 첫 렌더의 doc 만 본다 — 그 뒤의 변화는 동기화 effect 가 처리한다. */
  const [initialContent] = useState(() => docToTiptap(doc));

  const editor = useEditor({
    extensions,
    // 최초 내용. 이후의 외부 변경은 아래 동기화 effect 가 맡는다
    // (편집 중 매 글자마다 setContent 를 하면 커서가 맨 앞으로 튄다).
    content: initialContent,
    // Next.js 의 서버 렌더와 클라이언트 첫 렌더가 어긋나는 것을 막는다(TipTap 권장값)
    immediatelyRender: false,
    editorProps: {
      attributes: {
        // 편집 영역이 곧 고객 본문이다 — 클래스를 공유해야 두 화면이 갈라지지 않는다
        class: `${FLOW.root} min-h-64 outline-none`,
      },
      handleDrop: (_view, event) => {
        const files = Array.from(event.dataTransfer?.files ?? []);
        if (files.length === 0) return false;
        event.preventDefault();
        void insertFiles(files);
        return true; // 기본 처리(브라우저가 이미지를 새 탭에 여는 것)를 막는다
      },
      handlePaste: (_view, event) => {
        const files = Array.from(event.clipboardData?.files ?? []);
        if (files.length === 0) return false;
        event.preventDefault();
        void insertFiles(files);
        return true;
      },
    },
    onUpdate: ({ editor: e }) => {
      const next = tiptapToDoc(e.getJSON() as Parameters<typeof tiptapToDoc>[0]);
      // 사진 설명은 1..N 로 연속이어야 한다(scripts/verify_catalog.mjs 의 검사).
      // 순서를 바꾸거나 중간에 끼워 넣는 일이 편집 중 수시로 일어나므로 여기서 다시 매긴다.
      const renumbered = renumberImages(next, productNameRef.current);
      emittedRef.current = JSON.stringify(renumbered);
      onChangeRef.current(renumbered);
    },
  });

  /** 올린 사진을 커서 자리에 차례로 꽂는다 */
  const insertFiles = useCallback(
    async (files: File[]) => {
      const inserted = await ingest(files);
      if (!editor || inserted.length === 0) return;
      const chain = editor.chain().focus();
      for (const item of inserted) {
        chain.insertContent({
          type: "detailImage",
          attrs: {
            src: item.src,
            alt: item.alt,
            width: item.width,
            height: item.height,
            widthPct: 100,
            align: "center",
          },
        });
      }
      chain.run();
    },
    [editor, ingest]
  );

  /* 다른 탭에서 넘어온 파일. 같은 파일을 두 번 보낼 수도 있어서
     파일 목록이 아니라 일련번호로 새 반입인지 가린다. */
  const handledIntake = useRef<number | null>(null);
  useEffect(() => {
    if (!intake || handledIntake.current === intake.id) return;
    handledIntake.current = intake.id;
    void insertFiles(intake.files).finally(() => onIntakeDone?.());
  }, [intake, insertFiles, onIntakeDone]);

  /* 밖에서 문서가 통째로 바뀌면 편집기에 반영한다.

     이것이 필요한 경우는 두 가지다.
       ① 편집 화면이 상품을 비동기로 불러온다 — 편집기가 먼저 뜨고 doc 이 나중에 도착한다.
          동기화가 없으면 상품에 내용이 있는데 편집기는 빈 채로 남는다.
       ② 임시 저장한 초안을 되살릴 때.
     반대로 **내가 방금 올려 보낸 문서가 되돌아온 경우에는 절대 손대면 안 된다** —
     setContent 는 선택 영역을 초기화해서 글을 치는 도중 커서가 맨 앞으로 튄다. */
  useEffect(() => {
    if (!editor) return;
    const incoming = JSON.stringify(doc);
    if (incoming === emittedRef.current) return;
    emittedRef.current = incoming;
    // emitUpdate: false — 되살린 내용을 다시 부모로 튕겨 올리지 않는다(무한 왕복 방지)
    editor.commands.setContent(docToTiptap(doc), { emitUpdate: false });
  }, [doc, editor]);

  /* 자르기 요청은 노드뷰에서 CustomEvent 로 올라온다.
     TipTap 노드뷰에서 상위 React 트리로 콜백을 내려보내는 배선이 번거로워
     (확장 옵션 → 노드뷰 → 부모 상태) 이벤트 한 줄로 끊었다. */
  useEffect(() => {
    const onCrop = (e: Event) => setCrop((e as CustomEvent<CropRequestDetail>).detail);
    window.addEventListener(CROP_REQUEST_EVENT, onCrop);
    return () => window.removeEventListener(CROP_REQUEST_EVENT, onCrop);
  }, []);

  /** 자른 결과를 그 자리의 노드에 반영 — 치수가 바뀌므로 종횡비도 함께 갱신된다 */
  const applyCrop = useCallback(
    (result: CropResult) => {
      if (!editor || !crop) return;
      editor
        .chain()
        .focus()
        .command(({ tr }) => {
          const node = tr.doc.nodeAt(crop.pos);
          if (!node || node.type.name !== "detailImage") return false;
          tr.setNodeMarkup(crop.pos, undefined, {
            ...node.attrs,
            src: result.url,
            width: result.width,
            height: result.height,
            sourceUrl: result.sourceUrl,
          });
          return true;
        })
        .run();
      setCrop(null);
    },
    [editor, crop]
  );

  const imageCount = doc.blocks.filter((b) => b.type === "image").length;
  const leadCount = doc.blocks.filter(
    (b) => "lead" in b && (b as { lead?: boolean }).lead === true
  ).length;

  return (
    <div>
      <EditorToolbar
        editor={editor}
        viewport={viewport}
        onViewportChange={setViewport}
        onInsertImage={() => fileRef.current?.click()}
      />

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDropping(true);
        }}
        onDragLeave={(e) => {
          // 자식 위로 옮겨 갈 때도 dragleave 가 뜬다 — 진짜로 밖으로 나갔을 때만 끈다
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropping(false);
        }}
        onDrop={() => setDropping(false)}
        className={`relative transition-colors ${dropping ? "bg-forest-50" : ""}`}
      >
        <EditorStage viewport={viewport}>
          <EditorContent editor={editor} />
        </EditorStage>

        {dropping && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center border-2 border-dashed border-forest-600 bg-cream-50/70">
            <p className="flex items-center gap-2 text-sm text-forest-800">
              <UploadCloud size={18} strokeWidth={1.5} />
              놓으면 이 자리에 사진이 들어갑니다
            </p>
          </div>
        )}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          void insertFiles(Array.from(e.target.files ?? []));
          e.target.value = ""; // 같은 파일을 다시 골라도 change 가 뜨게 한다
        }}
      />

      {progress && (
        <div className="mt-3 border border-ink-200 bg-cream-50 p-3">
          <p className="text-sm text-ink-700">
            {progress.stage === "slicing" ? "사진을 나누는 중" : "사진을 저장하는 중"} —{" "}
            <span className="krw">
              {progress.done}/{progress.total}
            </span>
          </p>
          <p className="mt-1 truncate text-xs text-ink-400">{progress.fileName}</p>
          <div className="mt-2 h-1 w-full bg-ink-100">
            <div
              className="h-full bg-forest-700 transition-all duration-300"
              style={{ width: `${Math.round((progress.done / Math.max(1, progress.total)) * 100)}%` }}
            />
          </div>
        </div>
      )}

      {errors.length > 0 && (
        <div className="mt-3 border border-signal-red/30 bg-signal-red/5 p-3">
          <ul className="space-y-1">
            {errors.map((msg, i) => (
              <li key={i} className="text-xs leading-relaxed text-signal-red">
                {msg}
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={clearErrors}
            className="mt-2 text-xs text-ink-500 underline underline-offset-2"
          >
            메시지 지우기
          </button>
        </div>
      )}

      <p className="mt-3 text-xs text-ink-400">
        칸 <span className="krw">{doc.blocks.length}</span>개 · 사진{" "}
        <span className="krw">{imageCount}</span>장 · 가격 옆 요약{" "}
        <span className="krw">{leadCount}</span>칸
      </p>

      <CropModal
        open={crop !== null}
        src={crop?.attrs.src ?? ""}
        sourceUrl={crop?.attrs.sourceUrl ?? null}
        uploadPrefix={uploadPrefix}
        onClose={() => setCrop(null)}
        onCropped={applyCrop}
      />
    </div>
  );
}
