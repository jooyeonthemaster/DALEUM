"use client";

import { useRef, useState } from "react";
import { Download, FileSpreadsheet, UploadCloud } from "lucide-react";
import Modal from "@/components/admin/Modal";
import { Input, Help } from "@/components/admin/Field";
import { krw } from "@/lib/format";
import { BTN_GHOST, BTN_PRIMARY } from "@/app/admin/products/product-ui";
import { downloadStockWorkbook, readStockWorkbook } from "./inventory-excel";
import type {
  BulkStockResponse,
  BulkStockResult,
  BulkStockRow,
  InventoryListResponse,
} from "./inventory-types";

export interface BulkStockModalProps {
  open: boolean;
  onClose: () => void;
  /** 반영이 끝나 목록을 다시 읽어야 할 때 */
  onDone: (message: string, tone?: "ok" | "error") => void;
}

type Step = "pick" | "preview" | "done";

const KIND_LABEL: Record<BulkStockResult["kind"], string> = {
  restock: "입고",
  count: "실사 반영",
  skip: "건너뜀",
  error: "처리 못 함",
};

/**
 * 엑셀 일괄 입고 · 실사 반영.
 * 생산분이 들어온 날 37개 품목을 창 하나씩 열어 처리하던 것을 한 번에 끝내기 위한 창구다.
 * 반드시 미리보기를 거치게 했다 — 잘못 적은 수량이 그대로 반영되면 되돌릴 곳이 많아진다.
 */
export default function BulkStockModal({ open, onClose, onDone }: BulkStockModalProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>("pick");
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<BulkStockRow[]>([]);
  const [results, setResults] = useState<BulkStockResult[]>([]);
  const [summary, setSummary] = useState<BulkStockResponse["summary"] | null>(null);
  const [memo, setMemo] = useState("");
  const [busy, setBusy] = useState<null | "template" | "read" | "preview" | "apply">(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  /*
    이 파일 한 묶음을 가리키는 처리 식별자.
    재고 반영은 절대값이 아니라 증감이라, 응답이 끊겨 실패처럼 보일 때 다시 누르면 같은 수량이
    한 번 더 들어간다(이중 입고). 파일을 읽을 때 식별자를 한 번 만들어 두고 반영할 때마다 같은
    값을 보내면, 서버가 이력에 남은 표식을 보고 두 번째 실행을 거절한다.
    → 그래서 '실패한 것 같으면 한 번 더 눌러 보라' 고 안내해도 안전하다.
  */
  const batchIdRef = useRef("");

  async function downloadTemplate() {
    setBusy("template");
    setError(null);
    try {
      // 양식은 화면에 보이는 20줄이 아니라 전 품목이어야 한다 — 창고 대조는 전부를 놓고 한다
      const res = await fetch("/api/admin/inventory?page=1&limit=500&filter=all&sale=all");
      const data = (await res.json().catch(() => null)) as InventoryListResponse | null;
      if (!res.ok || !data?.rows) throw new Error("재고 목록을 불러오지 못했습니다.");
      await downloadStockWorkbook(data.rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "엑셀 양식을 만들지 못했습니다.");
    } finally {
      setBusy(null);
    }
  }

  async function pickFile(file: File) {
    setBusy("read");
    setError(null);
    try {
      const parsed = await readStockWorkbook(file);
      // 새 파일 = 새 묶음. randomUUID 가 없는 옛 브라우저를 위해 대체 값도 둔다
      batchIdRef.current =
        globalThis.crypto?.randomUUID?.() ??
        `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;
      if (parsed.length === 0) {
        throw new Error("수량이 적힌 줄이 없습니다. 입고 수량 또는 실제 재고 칸을 채워 주세요.");
      }
      setRows(parsed);
      setFileName(file.name);
      await runBulk(parsed, true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "엑셀을 읽지 못했습니다.");
      setBusy(null);
    }
  }

  async function runBulk(source: BulkStockRow[], dryRun: boolean) {
    setBusy(dryRun ? "preview" : "apply");
    setError(null);
    try {
      const res = await fetch("/api/admin/inventory/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dryRun,
          memo: memo.trim() || null,
          rows: source,
          batchId: batchIdRef.current,
        }),
      });
      const data = (await res.json().catch(() => null)) as
        | (BulkStockResponse & { error?: string })
        | null;
      if (!res.ok || !data?.results) {
        throw new Error(data?.error ?? "엑셀 내용을 처리하지 못했습니다.");
      }
      // 서버가 "이미 반영된 묶음" 이라고 답한 경우 — 두 번 눌렀거나 첫 응답만 유실된 것이다.
      // 결과표를 그릴 내용이 없으므로 표 대신 한 문장으로 알린다.
      if (!dryRun && data.alreadyApplied) {
        setResults([]);
        setSummary(null);
        setStep("done");
        const text = data.message ?? "이 엑셀은 이미 재고에 반영됐습니다.";
        setNotice(text);
        onDone(text, "ok");
        return;
      }

      setResults(data.results);
      setSummary(data.summary);
      setStep(dryRun ? "preview" : "done");
      if (!dryRun) {
        const { applied, failed } = data.summary;
        onDone(
          failed > 0
            ? `${krw(applied)}건을 반영하고 ${krw(failed)}건은 처리하지 못했습니다. 아래 목록에서 이유를 확인해 주세요.`
            : `${krw(applied)}건의 재고를 반영했습니다.`,
          failed > 0 ? "error" : "ok"
        );
      }
    } catch (e) {
      const base = e instanceof Error ? e.message : "엑셀 내용을 처리하지 못했습니다.";
      // 반영 중에 끊기면 재고에 들어갔는지 알 수 없다. 그대로 두면 관리자가 불안해서 다시 누르는데,
      // 처리 식별자 덕분에 다시 눌러도 같은 수량이 두 번 들어가지 않는다 — 그 사실을 알려 준다.
      setError(
        dryRun
          ? base
          : `${base} 재고에 반영됐는지 알 수 없습니다. 같은 수량이 두 번 들어가지는 않으니 '이대로 재고에 반영'을 한 번 더 눌러 확인해 주세요.`
      );
    } finally {
      setBusy(null);
    }
  }

  function reset() {
    setStep("pick");
    setRows([]);
    setResults([]);
    setSummary(null);
    setFileName("");
    setError(null);
    setNotice(null);
    batchIdRef.current = "";
  }

  const applyable = results.some((r) => r.kind === "restock" || r.kind === "count");

  return (
    <Modal
      open={open}
      onClose={busy ? () => undefined : onClose}
      title="엑셀로 일괄 입고 · 실사 반영"
      size="lg"
      footer={
        <>
          {step === "preview" && (
            <button type="button" onClick={reset} disabled={!!busy} className={BTN_GHOST}>
              다른 파일 올리기
            </button>
          )}
          <button type="button" onClick={onClose} disabled={!!busy} className={BTN_GHOST}>
            {step === "done" ? "닫기" : "취소"}
          </button>
          {step === "preview" && (
            <button
              type="button"
              onClick={() => void runBulk(rows, false)}
              disabled={!!busy || !applyable}
              className={BTN_PRIMARY}
            >
              {busy === "apply" ? "반영 중…" : "이대로 재고에 반영"}
            </button>
          )}
        </>
      }
    >
      <div className="space-y-5">
        {notice && <Help>{notice}</Help>}

        {step === "pick" && (
          <>
            <ol className="space-y-2 border border-ink-200 bg-cream-100 px-4 py-3.5 text-sm leading-relaxed text-ink-700">
              <li>1. 아래에서 지금 재고가 담긴 엑셀을 내려받습니다.</li>
              <li>
                2. 새로 들어온 수량은 <b>입고 수량</b> 칸에, 창고에서 세어 본 결과는{" "}
                <b>실제 재고</b> 칸에 적습니다. 손대지 않은 줄은 비워 두면 됩니다.
              </li>
              <li>3. 그 파일을 그대로 올리면 바뀔 내용을 먼저 보여 드립니다.</li>
              <li>4. 확인한 뒤 반영을 누르면 한 번에 처리됩니다.</li>
            </ol>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void downloadTemplate()}
                disabled={!!busy}
                className={BTN_GHOST}
              >
                <span className="inline-flex items-center gap-1.5">
                  <Download size={15} strokeWidth={1.5} />
                  {busy === "template" ? "만드는 중…" : "엑셀 양식 내려받기"}
                </span>
              </button>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={!!busy}
                className={BTN_PRIMARY}
              >
                <span className="inline-flex items-center gap-1.5">
                  <UploadCloud size={15} strokeWidth={1.5} />
                  {busy === "read" || busy === "preview" ? "읽는 중…" : "작성한 엑셀 올리기"}
                </span>
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) void pickFile(f);
                }}
              />
            </div>

            <div>
              <label htmlFor="bulk-memo" className="mb-1.5 block text-[13px] font-medium text-ink-700">
                이력에 남길 메모
              </label>
              <Input
                id="bulk-memo"
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                placeholder="예: 8월 2차 생산분 입고"
                maxLength={200}
              />
              <Help>엑셀에 메모를 적은 줄은 그 메모가 우선합니다.</Help>
            </div>
          </>
        )}

        {(step === "preview" || step === "done") && summary && (
          <>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border border-ink-200 bg-cream-100 px-4 py-3 text-sm text-ink-700">
              <span className="inline-flex items-center gap-1.5 font-medium text-ink-900">
                <FileSpreadsheet size={15} strokeWidth={1.5} />
                {fileName}
              </span>
              <span>
                {step === "preview" ? "반영 예정" : "반영함"}{" "}
                <b className="krw text-forest-700">{krw(summary.applied)}</b>건
              </span>
              <span>
                건너뜀 <b className="krw">{krw(summary.skipped)}</b>건
              </span>
              <span className={summary.failed > 0 ? "text-signal-red" : undefined}>
                처리 못 함 <b className="krw">{krw(summary.failed)}</b>건
              </span>
            </div>

            {step === "preview" && !applyable && (
              <Help tone="error">
                반영할 수 있는 줄이 없습니다. 아래 이유를 확인하고 엑셀을 고쳐 다시 올려 주세요.
              </Help>
            )}

            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="hairline-b">
                    <th scope="col" className="label-caps px-2 py-2 text-left text-ink-400">줄</th>
                    <th scope="col" className="label-caps px-2 py-2 text-left text-ink-400">품목</th>
                    <th scope="col" className="label-caps px-2 py-2 text-left text-ink-400">처리</th>
                    <th scope="col" className="label-caps whitespace-nowrap px-2 py-2 text-right text-ink-400">
                      현재고 → 변경 후
                    </th>
                    <th scope="col" className="label-caps px-2 py-2 text-left text-ink-400">안내</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r) => (
                    <tr key={`${r.no}-${r.label}`} className="border-b border-ink-100">
                      <td className="krw px-2 py-2 text-ink-400">{r.no}</td>
                      <td className="px-2 py-2 text-ink-900">{r.label}</td>
                      <td
                        className={`whitespace-nowrap px-2 py-2 ${
                          r.kind === "error"
                            ? "text-signal-red"
                            : r.kind === "skip"
                              ? "text-ink-400"
                              : "text-forest-700"
                        }`}
                      >
                        {KIND_LABEL[r.kind]}
                      </td>
                      <td className="krw whitespace-nowrap px-2 py-2 text-right text-ink-700">
                        {r.before === null
                          ? "—"
                          : r.after === null
                            ? `${krw(r.before)} → —`
                            : `${krw(r.before)} → ${krw(r.after)}`}
                      </td>
                      <td className={`px-2 py-2 text-xs ${r.kind === "error" ? "text-signal-red" : "text-ink-500"}`}>
                        {r.message}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {error && <Help tone="error">{error}</Help>}
      </div>
    </Modal>
  );
}
