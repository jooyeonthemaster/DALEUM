import { NextRequest } from "next/server";
import { BANNERS, listRows, createRow } from "../lib";

/** GET/POST /api/admin/content/banners */

export async function GET() {
  return listRows(BANNERS);
}

export async function POST(req: NextRequest) {
  return createRow(BANNERS, req);
}
