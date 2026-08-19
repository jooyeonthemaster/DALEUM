import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { BULK_INQUIRY_STATUS_LABELS } from "@/lib/constants";
import type { BulkInquiryStatus } from "@/lib/types";
import {
  composeInquiryMemo,
  INQUIRY_LOG_KINDS,
  isInquiryLogKind,
  parseInquiryMemo,
  stampKST,
  STATUS_CHANGE_KIND,
  type InquiryLogEntry,
} from "@/app/admin/bulk-inquiries/inquiry-log";

const STATUSES: BulkInquiryStatus[] = ["new", "contacted", "quoted", "closed", "spam"];

/** 자유 메모 + 처리 이력을 합쳐 담는 admin_memo 한 칸의 상한 (text 컬럼이라 DB 제약은 없다) */
const MEMO_LIMIT = 20000;
/** 이력 한 건 본문 상한 */
const LOG_TEXT_LIMIT = 2000;
/** 자유 메모 상한 */
const NOTE_LIMIT = 4000;

/**
 * PATCH /api/admin/bulk-inquiries/[id]
 *
 * body:
 * - status?: 처리 상태
 * - note?:   담당자 자유 메모 (전체 교체)
 * - log?:    { kind, text } — 처리 이력 한 건 덧붙이기
 *
 * 이력은 덧붙이기만 한다. 지우거나 고칠 수 있으면 "언제 무엇을 보냈는지" 를 증명하는
 * 기록으로 쓸 수 없기 때문이다. 상태를 바꾸면 그 사실도 이력으로 자동 기록한다.
 */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const { id } = await ctx.params;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }

  // ---------- 지금 저장돼 있는 값 ----------
  const { data: current, error: readError } = await auth.service
    .from("bulk_inquiries")
    .select("status, admin_memo")
    .eq("id", id)
    .maybeSingle();

  if (readError) {
    console.error("[admin/bulk-inquiries/:id] 문의 조회 실패:", readError.message);
    return NextResponse.json(
      { error: "문의를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요." },
      { status: 500 }
    );
  }
  if (!current) return NextResponse.json({ error: "문의를 찾을 수 없습니다." }, { status: 404 });

  const patch: Record<string, unknown> = {};
  const parsed = parseInquiryMemo((current as { admin_memo: string | null }).admin_memo);
  let note = parsed.note;
  const entries: InquiryLogEntry[] = [...parsed.entries];
  let memoTouched = false;

  // 이력에 이름을 남긴다 — 담당자가 바뀌어도 누가 처리했는지 알아야 한다
  const { data: me } = await auth.service
    .from("profiles")
    .select("name")
    .eq("id", auth.user.id)
    .maybeSingle();
  const author = ((me as { name: string | null } | null)?.name ?? "").trim() || "관리자";
  const at = stampKST();

  // ---------- 처리 상태 ----------
  if (body.status !== undefined) {
    if (!STATUSES.includes(body.status as BulkInquiryStatus)) {
      return NextResponse.json({ error: "처리 상태가 올바르지 않습니다." }, { status: 400 });
    }
    const next = body.status as BulkInquiryStatus;
    const prev = (current as { status: BulkInquiryStatus }).status;

    if (next !== prev) {
      patch.status = next;
      // '신규 접수'를 벗어나는 순간이 실제로 처리에 착수한 시점이다
      patch.handled_at = next === "new" ? null : new Date().toISOString();
      patch.handled_by = next === "new" ? null : auth.user.id;
      entries.push({
        at,
        kind: STATUS_CHANGE_KIND,
        author,
        body: `${BULK_INQUIRY_STATUS_LABELS[prev]} → ${BULK_INQUIRY_STATUS_LABELS[next]}`,
      });
      memoTouched = true;
    }
  }

  // ---------- 담당자 자유 메모 ----------
  if (body.note !== undefined) {
    note = typeof body.note === "string" ? body.note.trim().slice(0, NOTE_LIMIT) : "";
    memoTouched = true;
  }

  // ---------- 처리 이력 한 건 ----------
  if (body.log !== undefined) {
    const log = body.log as { kind?: unknown; text?: unknown } | null;
    if (!log || !isInquiryLogKind(log.kind)) {
      return NextResponse.json({ error: "기록 종류를 골라 주세요." }, { status: 400 });
    }
    const text = typeof log.text === "string" ? log.text.trim() : "";
    if (!text) {
      return NextResponse.json({ error: "기록할 내용을 입력해 주세요." }, { status: 400 });
    }
    if (text.length > LOG_TEXT_LIMIT) {
      return NextResponse.json(
        { error: `기록은 ${LOG_TEXT_LIMIT.toLocaleString("ko-KR")}자 이내로 입력해 주세요.` },
        { status: 400 }
      );
    }
    entries.push({ at, kind: INQUIRY_LOG_KINDS[log.kind], author, body: text });
    memoTouched = true;
  }

  if (memoTouched) {
    const composed = composeInquiryMemo(note, entries);
    if (composed.length > MEMO_LIMIT) {
      // 오래된 기록을 몰래 지우면 "언제 무엇을 보냈는지" 를 증명할 수 없게 된다 — 지우지 않고 막는다.
      return NextResponse.json(
        {
          error:
            "이 문의에 쌓인 기록이 너무 많아 더 저장할 수 없습니다. 마무리된 문의라면 상태를 '종결'로 바꿔 주세요.",
        },
        { status: 400 }
      );
    }
    patch.admin_memo = composed || null;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "변경할 내용이 없습니다." }, { status: 400 });
  }

  const { data, error } = await auth.service
    .from("bulk_inquiries")
    .update(patch)
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error) {
    console.error("[admin/bulk-inquiries/:id] 저장 실패:", error.message);
    return NextResponse.json(
      { error: "저장하지 못했습니다. 잠시 후 다시 시도해 주세요." },
      { status: 500 }
    );
  }
  if (!data) return NextResponse.json({ error: "문의를 찾을 수 없습니다." }, { status: 404 });

  return NextResponse.json({ inquiry: data });
}

/** DELETE /api/admin/bulk-inquiries/[id] */
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const { id } = await ctx.params;

  const { error } = await auth.service.from("bulk_inquiries").delete().eq("id", id);
  if (error) {
    console.error("[admin/bulk-inquiries/:id] 삭제 실패:", error.message);
    return NextResponse.json(
      { error: "삭제하지 못했습니다. 잠시 후 다시 시도해 주세요." },
      { status: 500 }
    );
  }
  return NextResponse.json({ ok: true });
}
