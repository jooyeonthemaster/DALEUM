import { NextRequest } from "next/server";
import { NOTICES, listRows, createRow } from "../lib";

/** GET/POST /api/admin/content/notices */

export async function GET() {
  return listRows(NOTICES);
}

export async function POST(req: NextRequest) {
  return createRow(NOTICES, req);
}
