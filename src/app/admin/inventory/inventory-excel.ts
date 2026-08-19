"use client";

/* ============================================================
   재고 엑셀 — 내려받기 양식 / 올린 파일 읽기

   왜 이 양식인가:
   공급사에서 오는 실제 엑셀이 '품번 · 제품명 · 규격' 형태라 관리자가 이미 품번으로 대조한다.
   그래서 같은 말('품번')을 쓰고, 짝을 맞추는 열은 품번을 먼저 본다.
   내려받은 파일이 곧 올릴 양식이다 — 따로 빈 양식을 만들게 하면 열 이름이 어긋나 실패한다.

   xlsx 는 무거워서 화면을 열 때가 아니라 버튼을 눌렀을 때 불러온다(동적 import).
   ============================================================ */

import { PRODUCT_SCOPE_LABEL, statusLabel } from "./inventory-ui";
import type { BulkStockRow, InventoryLogItem, InventoryUnit } from "./inventory-types";
import { INVENTORY_REASON_LABELS } from "@/app/admin/products/product-ui";
import { formatDateTime } from "@/lib/format";

/** 재고 양식 열 이름 — 읽을 때도 이 이름으로 열을 찾는다 */
export const STOCK_HEADERS = [
  "품번",
  "상품명",
  "옵션",
  "현재고",
  "품절 임박 기준",
  "판매 상태",
  "입고 수량",
  "실제 재고",
  "메모",
] as const;

const HEADER_HINT =
  "입고할 것은 '입고 수량' 칸에, 창고에서 세어 본 결과는 '실제 재고' 칸에만 적어 주세요. 두 칸을 같이 채우면 그 줄은 처리하지 않습니다.";

function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // 즉시 해제하면 일부 브라우저에서 저장이 취소된다 — 한 박자 뒤에 정리한다
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function todayStamp(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}${m}${day}`;
}

/** 지금 목록을 그대로 엑셀로 — 창고 대조용이자 일괄 입고 양식 */
export async function downloadStockWorkbook(units: InventoryUnit[]) {
  const XLSX = await import("xlsx");
  const rows: (string | number)[][] = [
    [HEADER_HINT],
    [...STOCK_HEADERS],
    ...units.map((u) => [
      // 품번은 '이 행만의 품번' 일 때만 적는다.
      // 실 DB 에는 첫 옵션의 품번이 상품 품번과 똑같이 들어 있어(옵션 18개 중 7개),
      // 그대로 찍으면 한 품번이 '상품 자체 재고' 행과 옵션 행 둘을 가리켜
      // 서버가 그 줄을 "품번이 겹친다" 며 통째로 거절했다. 비워 두면 상품명+옵션으로 짝을 맞춘다.
      u.has_own_sku ? (u.sku ?? "") : "",
      u.name,
      u.scope === "variant" ? (u.option_name ?? "") : u.has_options ? PRODUCT_SCOPE_LABEL : "",
      u.stock,
      u.threshold ?? "",
      statusLabel(u.status),
      "",
      "",
      "",
    ]),
  ];

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [
    { wch: 16 },
    { wch: 30 },
    { wch: 18 },
    { wch: 10 },
    { wch: 14 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 24 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "재고");
  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
  saveBlob(
    new Blob([out], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    `다름_재고_${todayStamp()}.xlsx`
  );
}

/** 올린 파일에서 줄을 읽어 온다 — 어떤 값이 유효한지는 서버가 판단한다 */
export async function readStockWorkbook(file: File): Promise<BulkStockRow[]> {
  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array" });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error("엑셀에 시트가 없습니다.");
  const ws = wb.Sheets[sheetName];
  const table = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" });

  // 안내문이 첫 줄에 있을 수도 있어 머리글 줄을 찾아서 시작한다
  const headerIndex = table.findIndex((row) =>
    row.some((cell) => typeof cell === "string" && cell.trim() === "상품명")
  );
  if (headerIndex < 0) {
    throw new Error(
      "열 이름을 찾지 못했습니다. '엑셀 양식 내려받기' 로 받은 파일에 수량만 적어서 올려 주세요."
    );
  }

  const header = table[headerIndex].map((c) => (typeof c === "string" ? c.trim() : String(c ?? "")));
  const col = (name: string) => header.indexOf(name);
  const idx = {
    sku: col("품번"),
    name: col("상품명"),
    option: col("옵션"),
    // 내려받던 때의 현재고. 세는 동안 주문이 나갔는데 실사 결과로 덮어쓰면 그 판매가 되살아난다 —
    // 서버가 이 값과 지금 재고를 대조해 다르면 그 줄을 건드리지 않는다.
    current: col("현재고"),
    restock: col("입고 수량"),
    count: col("실제 재고"),
    memo: col("메모"),
  };

  const text = (row: unknown[], at: number): string => {
    if (at < 0) return "";
    const v = row[at];
    if (v === null || v === undefined) return "";
    return typeof v === "string" ? v.trim() : String(v);
  };

  const rows: BulkStockRow[] = [];
  for (let i = headerIndex + 1; i < table.length; i += 1) {
    const row = table[i];
    const parsed: BulkStockRow = {
      no: i - headerIndex,
      sku: text(row, idx.sku),
      productName: text(row, idx.name),
      optionName: text(row, idx.option),
      current: text(row, idx.current),
      restock: text(row, idx.restock),
      count: text(row, idx.count),
      memo: text(row, idx.memo),
    };
    // 수량을 적지 않은 줄은 아예 보내지 않는다.
    // 양식에는 전 품목이 들어 있어서, 손대지 않은 줄까지 보내면 미리보기가
    // '건너뜀' 수십 줄로 뒤덮여 정작 확인해야 할 줄이 묻힌다.
    if (!parsed.restock && !parsed.count) continue;
    rows.push(parsed);
  }
  return rows;
}

/** 입출고 이력을 엑셀로 — 기간별 정산·대조용 */
export async function downloadLogWorkbook(logs: InventoryLogItem[]) {
  const XLSX = await import("xlsx");
  const rows: (string | number)[][] = [
    ["일시", "상품명", "옵션", "변동", "사유", "주문번호", "메모"],
    ...logs.map((l) => [
      formatDateTime(l.created_at),
      l.product_name,
      l.variant_name ?? "",
      l.delta,
      INVENTORY_REASON_LABELS[l.reason] ?? "기타",
      l.order?.order_no ?? "",
      // 메모의 처리 표식은 이력 API 가 이미 지우고 내려 준다 (화면·엑셀 모두 사람 말만 본다)
      l.memo ?? "",
    ]),
  ];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [
    { wch: 18 },
    { wch: 30 },
    { wch: 18 },
    { wch: 10 },
    { wch: 12 },
    { wch: 18 },
    { wch: 30 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "입출고 이력");
  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
  saveBlob(
    new Blob([out], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    `다름_입출고이력_${todayStamp()}.xlsx`
  );
}
