import { NextRequest } from "next/server";
import { NOTICES, updateRow, deleteRow } from "../../lib";

/** PATCH/DELETE /api/admin/content/notices/[id] */

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  return updateRow(NOTICES, req, id);
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  return deleteRow(NOTICES, id);
}
