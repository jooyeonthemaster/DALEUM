import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { fetchCustomers, parseCustomerQuery } from "../shared";

/**
 * GET /api/admin/customers/export — 지금 걸린 조건 그대로 고객 명단 파일 내려주기
 *
 * 왜 필요한가: "누적 30만원 이상 고객에게 문자 보내기" 같은 가장 기본적인 일을 하려면
 * 이름·연락처 명단이 파일로 나와야 한다. 지금까지는 개발자에게 DB 조회를 부탁하는 수밖에 없었다.
 *
 * 엑셀이 UTF-8 을 알아보게 하려면 파일 맨 앞에 BOM 이 있어야 한다.
 * 없으면 한글이 전부 깨져서 열린다(엑셀이 시스템 코드페이지로 읽는다).
 */

const BOM = "﻿";
const HEADERS = [
  "이름",
  "이메일",
  "연락처",
  "가입일",
  "주문수",
  "누적구매액(원)",
  "VIP 그룹",
  "마케팅 수신 동의",
];

/** 쉼표·큰따옴표·줄바꿈이 들어가도 칸이 밀리지 않게 감싼다 */
function cell(value: string | number | null): string {
  const text = value == null ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

/** 2026.08.19 — 화면과 같은 한국식 표기 (ISO 문자열을 파일에 남기지 않는다) */
function ymd(iso: string): string {
  const d = new Date(iso);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}.${m}.${day}`;
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const query = parseCustomerQuery(req.nextUrl.searchParams);
  const result = await fetchCustomers(auth.service, query);
  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 500 });

  const lines = [HEADERS.map(cell).join(",")];
  for (const r of result.rows) {
    lines.push(
      [
        cell(r.name ?? ""),
        cell(r.email ?? ""),
        cell(r.phone ?? ""),
        cell(ymd(r.created_at)),
        cell(r.order_count),
        cell(r.total_spent),
        cell(r.vip_group ?? ""),
        cell(r.marketing_opt_in ? "동의" : "미동의"),
      ].join(",")
    );
  }

  const today = ymd(new Date().toISOString()).replace(/\./g, "");
  return new NextResponse(BOM + lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="daleum-customers-${today}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
