"use client";

/* ============================================================
   견적 문의 상세 — 접수 내용 확인 → 연락 → 기록 → 상태 변경까지 한 화면에서

   여기서 분명히 해야 하는 것:
   이 화면에서 무엇을 적어도 거래처에 자동으로 가지 않는다. 메일을 대신 보내주는
   장치가 이 저장소에 없다(발송 라이브러리가 하나도 없다). 예전 화면은 '이메일로 회신'
   버튼 하나만 있어서, 회사 PC에 메일 계정이 연결돼 있지 않으면 눌러도 아무 일이 없었고
   무엇을 보냈는지도 남지 않았다. 그래서 (1) 자동 발송이 없다는 사실을 화면에 적고,
   (2) 직접 연락한 내용을 기록으로 남기게 한다.
   ============================================================ */

import { useMemo, useState } from "react";
import Modal from "@/components/admin/Modal";
import ConfirmDialog from "@/components/admin/ConfirmDialog";
import { Help, Label, Select, Textarea } from "@/components/admin/Field";
import { formatDateTime, formatPhone } from "@/lib/format";
import {
  BULK_INQUIRY_PURPOSE_LABELS,
  BULK_INQUIRY_STATUS_LABELS,
} from "@/lib/constants";
import type { BulkInquiryStatus } from "@/lib/types";
import {
  INQUIRY_LOG_KINDS,
  parseInquiryMemo,
  type InquiryLogKind,
} from "./inquiry-log";
import {
  InquiryItemChips,
  STATUS_MEANINGS,
  STATUS_ORDER,
  type AdminBulkInquiry,
} from "./inquiry-ui";

export interface InquiryDetailModalProps {
  inquiry: AdminBulkInquiry;
  onClose: () => void;
  /** 저장/기록 후 갱신된 문의 (목록도 다시 읽는다) */
  onUpdated: (next: AdminBulkInquiry) => void;
  onDeleted: () => void;
}

const LOG_KIND_ORDER: InquiryLogKind[] = ["call", "email", "quote", "meeting", "note"];

export default function InquiryDetailModal({
  inquiry,
  onClose,
  onUpdated,
  onDeleted,
}: InquiryDetailModalProps) {
  const stored = useMemo(() => parseInquiryMemo(inquiry.admin_memo), [inquiry.admin_memo]);

  const [status, setStatus] = useState<BulkInquiryStatus>(inquiry.status);
  const [note, setNote] = useState(stored.note);
  const [logKind, setLogKind] = useState<InquiryLogKind>("call");
  const [logText, setLogText] = useState("");
  const [busy, setBusy] = useState<"save" | "log" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const dirty = status !== inquiry.status || note !== stored.note;
  // 새 기록이 위로 오게 뒤집는다 — 마지막에 무슨 일이 있었는지가 가장 궁금하다
  const entries = useMemo(() => [...stored.entries].reverse(), [stored.entries]);

  async function patch(body: Record<string, unknown>, mode: "save" | "log") {
    setBusy(mode);
    setError(null);
    try {
      const res = await fetch(`/api/admin/bulk-inquiries/${inquiry.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? "저장하지 못했습니다. 잠시 후 다시 시도해 주세요.");
        return false;
      }
      // 관심 품목(items)은 목록 API 가 붙여 준 값이라 응답에 없다 — 화면에 있던 것을 유지한다
      onUpdated({ ...inquiry, ...(json.inquiry ?? {}), items: inquiry.items });
      return true;
    } catch {
      setError("네트워크 문제로 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.");
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    const ok = await patch({ status, note }, "save");
    if (ok) onClose();
  }

  async function addLog() {
    if (!logText.trim()) {
      setError("기록할 내용을 입력해 주세요.");
      return;
    }
    // 적어 두고 아직 저장하지 않은 메모까지 함께 보낸다 — 기록만 남고 메모가 날아가면 안 된다
    const ok = await patch({ note, log: { kind: logKind, text: logText } }, "log");
    if (ok) setLogText("");
  }

  async function remove() {
    const res = await fetch(`/api/admin/bulk-inquiries/${inquiry.id}`, { method: "DELETE" });
    if (res.ok) {
      setConfirmDelete(false);
      onDeleted();
    } else {
      const json = await res.json().catch(() => ({}));
      setConfirmDelete(false);
      setError(json.error ?? "삭제하지 못했습니다.");
    }
  }

  async function copyEmail() {
    try {
      await navigator.clipboard.writeText(inquiry.email);
      setCopied(true);
    } catch {
      setError("이메일 주소를 복사하지 못했습니다. 주소를 직접 드래그해 복사해 주세요.");
    }
  }

  const facts: [string, string][] = [
    ["담당자", inquiry.contact_name],
    ["연락처", formatPhone(inquiry.phone)],
    ["이메일", inquiry.email],
    ["사업자등록번호", inquiry.biz_no ?? "—"],
    ["문의 유형", inquiry.purpose ? BULK_INQUIRY_PURPOSE_LABELS[inquiry.purpose] : "—"],
    ["예상 물량·주기", inquiry.volume ?? "—"],
    ["접수일", formatDateTime(inquiry.created_at)],
  ];

  return (
    <>
      <Modal
        open
        onClose={onClose}
        title={`${inquiry.company} — 견적 문의`}
        size="lg"
        footer={
          <div className="flex w-full items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="text-[13px] text-ink-400 transition-colors hover:text-signal-red"
            >
              삭제
            </button>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="border border-ink-200 px-4 py-2.5 text-sm text-ink-700 transition-colors hover:border-ink-400"
              >
                닫기
              </button>
              <button
                type="button"
                onClick={save}
                disabled={busy !== null || !dirty}
                className="bg-forest-900 px-5 py-2.5 text-sm text-cream-50 transition-colors hover:bg-forest-950 disabled:bg-ink-200 disabled:text-ink-400"
              >
                {busy === "save" ? "저장 중…" : dirty ? "저장" : "저장할 변경 없음"}
              </button>
            </div>
          </div>
        }
      >
        <div className="space-y-6">
          {/* ---------- 접수 정보 ---------- */}
          <dl className="hairline-t">
            {facts.map(([k, v]) => (
              <div
                key={k}
                className="flex items-baseline justify-between gap-6 border-b border-ink-100 py-2.5"
              >
                <dt className="shrink-0 text-[13px] text-ink-500">{k}</dt>
                <dd className="text-right text-[13px] text-ink-900">{v}</dd>
              </div>
            ))}
          </dl>

          <div>
            <Label>관심 품목</Label>
            <InquiryItemChips items={inquiry.items} />
          </div>

          <div>
            <Label>문의 내용</Label>
            <p className="whitespace-pre-line border border-ink-200 bg-cream-50 px-4 py-3.5 text-sm leading-relaxed text-ink-800">
              {inquiry.message}
            </p>
          </div>

          {/* ---------- 연락 ---------- */}
          <section className="border border-ink-200 bg-cream-100 p-4">
            <p className="text-[13px] font-medium text-ink-900">거래처에 직접 연락해야 합니다</p>
            <p className="mt-1.5 text-xs leading-relaxed text-ink-500">
              이 화면에 적는 내용은 거래처에 자동으로 전달되지 않습니다. 아래 연락처로 전화하거나
              메일을 보낸 뒤, 무엇을 보냈는지 처리 기록에 남겨 주세요.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <a
                href={`tel:${inquiry.phone.replace(/[^0-9+]/g, "")}`}
                className="border border-ink-200 bg-cream-50 px-3 py-2 text-[13px] text-ink-700 transition-colors hover:border-ink-400"
              >
                전화 걸기
              </a>
              <a
                href={`mailto:${inquiry.email}?subject=${encodeURIComponent(
                  `[다름] ${inquiry.company} 견적 문의 회신`
                )}`}
                className="border border-ink-200 bg-cream-50 px-3 py-2 text-[13px] text-ink-700 transition-colors hover:border-ink-400"
              >
                메일 프로그램으로 쓰기
              </a>
              <button
                type="button"
                onClick={copyEmail}
                className="border border-ink-200 bg-cream-50 px-3 py-2 text-[13px] text-ink-700 transition-colors hover:border-ink-400"
              >
                {copied ? "복사했습니다" : "이메일 주소 복사"}
              </button>
            </div>
            <Help>
              메일 프로그램이 열리지 않는 컴퓨터라면 주소를 복사해 평소 쓰는 메일에서 보내세요.
            </Help>
          </section>

          {/* ---------- 처리 상태 ---------- */}
          <div className="grid gap-4 md:grid-cols-[200px_1fr]">
            <div>
              <Label htmlFor="bi-status">처리 상태</Label>
              <Select
                id="bi-status"
                value={status}
                onChange={(e) => setStatus(e.target.value as BulkInquiryStatus)}
              >
                {STATUS_ORDER.map((s) => (
                  <option key={s} value={s}>
                    {BULK_INQUIRY_STATUS_LABELS[s]}
                  </option>
                ))}
              </Select>
              <Help>{STATUS_MEANINGS[status]}</Help>
            </div>
            <div>
              <Label htmlFor="bi-note">담당자 메모</Label>
              <Textarea
                id="bi-note"
                rows={4}
                value={note}
                maxLength={4000}
                onChange={(e) => setNote(e.target.value)}
                placeholder="이 거래처를 다룰 때 알아 둘 점을 적어 두세요. (예: 금요일 오전에만 통화 가능)"
              />
              <Help>아래 처리 기록과 달리 언제든 고쳐 쓸 수 있는 메모입니다.</Help>
            </div>
          </div>

          {/* ---------- 처리 기록 ---------- */}
          <section className="border border-ink-200 p-4">
            <p className="text-[13px] font-medium text-ink-900">처리 기록</p>
            <Help>
              통화·메일·견적 발송처럼 실제로 한 일을 남깁니다. 남긴 기록은 지울 수 없습니다 —
              나중에 &ldquo;견적을 못 받았다&rdquo;는 말이 나왔을 때 근거가 되어야 하기 때문입니다.
            </Help>

            <div className="mt-3 grid gap-2 md:grid-cols-[160px_1fr]">
              <Select
                aria-label="기록 종류"
                value={logKind}
                onChange={(e) => setLogKind(e.target.value as InquiryLogKind)}
              >
                {LOG_KIND_ORDER.map((k) => (
                  <option key={k} value={k}>
                    {INQUIRY_LOG_KINDS[k]}
                  </option>
                ))}
              </Select>
              <Textarea
                aria-label="기록 내용"
                rows={3}
                value={logText}
                maxLength={2000}
                onChange={(e) => setLogText(e.target.value)}
                placeholder="예: 10입 기준 단가표를 메일로 보냈습니다. 최소 주문 수량 200박스 안내."
              />
            </div>
            <div className="mt-2 flex justify-end">
              <button
                type="button"
                onClick={addLog}
                disabled={busy !== null}
                className="border border-forest-700 px-4 py-2 text-[13px] text-forest-800 transition-colors hover:bg-forest-100 disabled:border-ink-200 disabled:text-ink-400"
              >
                {busy === "log" ? "남기는 중…" : "기록 남기기"}
              </button>
            </div>

            {entries.length === 0 ? (
              <p className="mt-3 border-t border-ink-100 pt-4 text-center text-sm text-ink-400">
                아직 남긴 기록이 없습니다.
              </p>
            ) : (
              <ol className="mt-3 divide-y divide-ink-100 border-t border-ink-100">
                {entries.map((e, i) => (
                  <li key={`${e.at}-${i}`} className="py-3">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="bg-cream-200 px-2 py-0.5 text-[11px] text-ink-700">
                        {e.kind}
                      </span>
                      <span className="krw text-xs text-ink-400">{e.at}</span>
                      {e.author && <span className="text-xs text-ink-400">{e.author}</span>}
                    </div>
                    {e.body && (
                      <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-ink-700">
                        {e.body}
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </section>

          {error && (
            <p role="alert" className="text-sm text-signal-red">
              {error}
            </p>
          )}
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={remove}
        title="문의를 삭제할까요?"
        description="삭제하면 문의 내용과 처리 기록이 모두 사라지고 되돌릴 수 없습니다. 광고성 문의라면 상태를 '스팸'으로 바꿔 보관하는 편이 좋습니다."
        confirmLabel="삭제"
        danger
      />
    </>
  );
}
