"use client";

import { useRef, useState } from "react";
import { Download, Upload } from "lucide-react";
import Modal from "@/components/admin/Modal";
import { Help } from "@/components/admin/Field";
import { CARRIERS } from "@/lib/constants";

/* ============================================================
   운송장 번호 일괄 등록 — 양식 내려받기 → 올리기 → 미리보기 → 확정

   왜 필요한가:
   택배사에 발송을 접수하면 운송장 번호가 엑셀로 회신된다. 그런데 이 시스템에 넣는 길은
   '목록 → 주문 클릭 → 택배사 선택 → 번호 입력 → 등록 → 뒤로' 뿐이었다. 하루 100건이면
   600번 넘는 클릭이고, 그 반복 중 한 줄만 밀리면 고객이 남의 배송을 조회한다.
   대표·마케터가 감당할 수 없어 결국 개발자 스크립트로 되돌아가게 되는 자리였다.

   확정 전에 반드시 행 단위 미리보기를 보여준다 — 운송장이 엉뚱한 주문에 붙는 것은
   되돌리기 어려운 사고라, 무엇이 바뀌는지 눈으로 확인한 뒤에만 반영한다.
   ============================================================ */

interface PreviewRow {
  line: number;
  orderNo: string;
  carrierName: string;
  trackingNo: string;
  ok: boolean;
  reason: string;
  applied: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** 반영이 끝나면 목록을 다시 읽는다 */
  onApplied: () => void;
}

interface ParsedRow {
  orderNo: string;
  carrier: string;
  trackingNo: string;
}

const CARRIER_NAMES = CARRIERS.map((c) => c.name).join(" · ");

function cell(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}

/** 열 이름이 조금 달라도 알아본다 — "송장번호", "택배사명" 같은 표기가 흔하다 */
function findColumn(headers: string[], keys: string[]): number {
  return headers.findIndex((h) => keys.some((k) => h.replace(/\s/g, "").includes(k)));
}

export default function TrackingUploadDialog({ open, onClose, onApplied }: Props) {
  const fileInput = useRef<HTMLInputElement | null>(null);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<PreviewRow[] | null>(null);
  const [summary, setSummary] = useState<{ ok: number; failed: number; applied: number } | null>(
    null
  );
  const [committed, setCommitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setRows([]);
    setFileName("");
    setPreview(null);
    setSummary(null);
    setCommitted(false);
    setError(null);
    if (fileInput.current) fileInput.current.value = "";
  }

  async function downloadTemplate() {
    const XLSX = await import("xlsx");
    const ws = XLSX.utils.aoa_to_sheet([["주문번호", "택배사", "운송장번호"]]);
    ws["!cols"] = [{ wch: 18 }, { wch: 14 }, { wch: 18 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "운송장등록");
    XLSX.writeFile(wb, "다름_운송장등록_양식.xlsx");
  }

  async function readFile(file: File) {
    setBusy(true);
    setError(null);
    setPreview(null);
    setSummary(null);
    setCommitted(false);
    try {
      const XLSX = await import("xlsx");
      const buffer = await file.arrayBuffer();
      const book = XLSX.read(buffer, { type: "array" });
      const sheet = book.Sheets[book.SheetNames[0]];
      const table = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false });
      if (table.length < 2) {
        throw new Error("첫 줄에 열 이름, 둘째 줄부터 내용이 있어야 합니다.");
      }

      const headers = (table[0] as unknown[]).map((h) => cell(h));
      const orderCol = findColumn(headers, ["주문번호", "주문No", "주문no"]);
      const carrierCol = findColumn(headers, ["택배"]);
      const trackCol = findColumn(headers, ["운송장", "송장"]);
      const missing = [
        orderCol < 0 ? "주문번호" : null,
        carrierCol < 0 ? "택배사" : null,
        trackCol < 0 ? "운송장번호" : null,
      ].filter(Boolean);
      if (missing.length > 0) {
        throw new Error(
          `${missing.join(" · ")} 열을 찾지 못했습니다. 양식을 내려받아 그 열 이름을 그대로 써 주세요.`
        );
      }

      const parsed: ParsedRow[] = [];
      for (const raw of table.slice(1)) {
        const line = raw as unknown[];
        const orderNo = cell(line[orderCol]);
        const trackingNo = cell(line[trackCol]);
        // 주문번호도 운송장도 없는 줄은 빈 줄로 본다
        if (!orderNo && !trackingNo) continue;
        parsed.push({ orderNo, carrier: cell(line[carrierCol]), trackingNo });
      }
      if (parsed.length === 0) {
        throw new Error("채워진 줄이 없습니다. 운송장 번호를 넣은 뒤 다시 올려 주세요.");
      }

      setRows(parsed);
      setFileName(file.name);
      await check(parsed);
    } catch (e) {
      setError(e instanceof Error ? e.message : "파일을 읽지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function send(payload: ParsedRow[], commit: boolean) {
    const res = await fetch("/api/admin/orders/tracking/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows: payload, commit }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? "확인하지 못했습니다.");
    setPreview(json.rows as PreviewRow[]);
    setSummary(json.summary as { ok: number; failed: number; applied: number });
    setCommitted(Boolean(json.committed));
    return json;
  }

  async function check(payload: ParsedRow[]) {
    await send(payload, false);
  }

  async function commit() {
    if (busy || rows.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      await send(rows, true);
      onApplied();
    } catch (e) {
      setError(e instanceof Error ? e.message : "반영하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  const failed = preview?.filter((r) => !r.ok) ?? [];

  return (
    <Modal
      open={open}
      onClose={
        busy
          ? () => undefined
          : () => {
              reset();
              onClose();
            }
      }
      title="운송장 번호 일괄 등록"
      size="lg"
      footer={
        <>
          <button
            type="button"
            onClick={() => {
              reset();
              onClose();
            }}
            disabled={busy}
            className="border border-ink-200 bg-cream-50 px-4 py-2.5 text-sm text-ink-700 transition-colors hover:bg-cream-100 disabled:opacity-50"
          >
            닫기
          </button>
          {preview && !committed && (
            <button
              type="button"
              onClick={commit}
              disabled={busy || (summary?.ok ?? 0) === 0}
              className="bg-forest-700 px-4 py-2.5 text-sm text-cream-50 transition-colors hover:bg-forest-800 disabled:opacity-50"
            >
              {busy ? "반영 중…" : `${summary?.ok ?? 0}건 등록 확정`}
            </button>
          )}
        </>
      }
    >
      <div className="space-y-5">
        {/* 1단계 — 양식 */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={downloadTemplate}
            className="inline-flex items-center gap-2 border border-ink-200 bg-cream-50 px-4 py-2.5 text-sm text-ink-700 transition-colors hover:bg-cream-100"
          >
            <Download size={16} strokeWidth={1.5} />
            양식 내려받기
          </button>
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={busy}
            className="inline-flex items-center gap-2 border border-ink-200 bg-cream-50 px-4 py-2.5 text-sm text-ink-700 transition-colors hover:bg-cream-100 disabled:opacity-50"
          >
            <Upload size={16} strokeWidth={1.5} />
            {busy && !preview ? "읽는 중…" : "파일 올리기"}
          </button>
          {fileName && <span className="text-xs text-ink-500">{fileName}</span>}
          <input
            ref={fileInput}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) readFile(file);
            }}
          />
        </div>

        <Help>
          주문번호 · 택배사 · 운송장번호 세 칸만 있으면 됩니다. 엑셀 내려받기로 받은 발송 목록에
          번호만 채워 그대로 올려도 됩니다. 택배사는 {CARRIER_NAMES} 중 하나로 적어 주세요.
        </Help>

        {error && <Help tone="error">{error}</Help>}

        {/* 2단계 — 미리보기 */}
        {preview && summary && (
          <div className="space-y-3">
            <p className="text-sm text-ink-700">
              {committed
                ? `${summary.applied}건을 등록했습니다.`
                : `${summary.ok}건은 등록할 수 있고, ${summary.failed}건은 문제가 있습니다.`}
              {!committed && summary.ok > 0 && (
                <span className="ml-1 text-ink-500">
                  아래를 확인한 뒤 &lsquo;등록 확정&rsquo; 을 눌러 주세요.
                </span>
              )}
            </p>

            {failed.length > 0 && (
              <div className="border border-signal-red/40 bg-[#f9efe9] p-3.5">
                <p className="text-sm font-medium text-signal-red">
                  넣을 수 없는 줄 {failed.length}건
                </p>
                <ul className="mt-2 space-y-1 text-xs leading-relaxed text-signal-red">
                  {failed.slice(0, 20).map((r) => (
                    <li key={`fail-${r.line}`}>
                      {r.line}번째 줄 {r.orderNo || "(주문번호 없음)"} — {r.reason}
                    </li>
                  ))}
                  {failed.length > 20 && <li>… 외 {failed.length - 20}건</li>}
                </ul>
              </div>
            )}

            <div className="max-h-72 overflow-y-auto border border-ink-200">
              <table className="w-full border-collapse text-sm">
                <thead className="sticky top-0 bg-cream-100">
                  <tr className="hairline-b">
                    <th className="px-3 py-2 text-left text-xs font-medium text-ink-500">줄</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-ink-500">주문번호</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-ink-500">택배사</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-ink-500">운송장번호</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-ink-500">결과</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((r) => (
                    <tr key={`row-${r.line}`} className="border-b border-ink-100">
                      <td className="krw px-3 py-2 text-xs text-ink-400">{r.line}</td>
                      <td className="krw px-3 py-2 text-ink-900">{r.orderNo}</td>
                      <td className="px-3 py-2 text-ink-700">{r.carrierName || "—"}</td>
                      <td className="krw px-3 py-2 text-ink-700">{r.trackingNo || "—"}</td>
                      <td
                        className={`px-3 py-2 text-xs leading-relaxed ${
                          r.ok ? "text-forest-700" : "text-signal-red"
                        }`}
                      >
                        {r.reason}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
