import { NextRequest } from "next/server";
import { BANNERS, updateRow, deleteRow } from "../../lib";

/** PATCH/DELETE /api/admin/content/banners/[id] */

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  return updateRow(BANNERS, req, id);
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  return deleteRow(BANNERS, id);
}
