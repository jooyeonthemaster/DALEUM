import { NextRequest } from "next/server";
import { POPUPS, updateRow, deleteRow } from "../../lib";

/** PATCH/DELETE /api/admin/content/popups/[id] */

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  return updateRow(POPUPS, req, id);
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  return deleteRow(POPUPS, id);
}
