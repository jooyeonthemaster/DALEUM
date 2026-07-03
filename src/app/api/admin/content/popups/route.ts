import { NextRequest } from "next/server";
import { POPUPS, listRows, createRow } from "../lib";

/** GET/POST /api/admin/content/popups */

export async function GET() {
  return listRows(POPUPS);
}

export async function POST(req: NextRequest) {
  return createRow(POPUPS, req);
}
