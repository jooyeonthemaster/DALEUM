import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { DEFAULT_SHIPPING } from "@/lib/shipping";
import { COMPANY } from "@/lib/constants";
import type { ShippingSettings } from "@/lib/types";

/**
 * GET /api/admin/settings — { shipping, store }
 * PUT /api/admin/settings — { key: "shipping" | "store", value: {...} } 업서트
 */

export interface StoreSettings {
  name: string;
  cs_phone: string;
  cs_hours: string;
}

const DEFAULT_STORE: StoreSettings = {
  name: COMPANY.brand,
  cs_phone: COMPANY.tel,
  cs_hours: COMPANY.csHours,
};

function nonNegativeInt(v: unknown): number | null {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 10_000_000) return null;
  return Math.round(n);
}

function boundedStr(v: unknown, max = 100): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s.length <= max ? s : null;
}

export async function GET() {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const { service } = auth;

  const { data, error } = await service
    .from("settings")
    .select("key, value, updated_at")
    .in("key", ["shipping", "store"]);

  if (error) {
    console.error("[admin/settings GET]", error);
    return NextResponse.json({ error: "설정을 불러오지 못했습니다." }, { status: 500 });
  }

  const map = new Map((data ?? []).map((r) => [r.key as string, r.value]));
  const shipping: ShippingSettings = {
    ...DEFAULT_SHIPPING,
    ...((map.get("shipping") as Partial<ShippingSettings>) ?? {}),
  };
  const store: StoreSettings = {
    ...DEFAULT_STORE,
    ...((map.get("store") as Partial<StoreSettings>) ?? {}),
  };

  return NextResponse.json({ shipping, store });
}

export async function PUT(req: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const { service } = auth;

  const body = (await req.json().catch(() => null)) as {
    key?: unknown;
    value?: unknown;
  } | null;
  if (!body || typeof body.value !== "object" || body.value === null) {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const key = body.key;
  const raw = body.value as Record<string, unknown>;
  let value: Record<string, unknown>;

  if (key === "shipping") {
    const base_fee = nonNegativeInt(raw.base_fee);
    const free_threshold = nonNegativeInt(raw.free_threshold);
    const island_extra = nonNegativeInt(raw.island_extra);
    if (base_fee === null || free_threshold === null || island_extra === null) {
      return NextResponse.json(
        { error: "배송비 설정 값이 올바르지 않습니다. 0 이상의 숫자를 입력해 주세요." },
        { status: 400 }
      );
    }
    value = { base_fee, free_threshold, island_extra };
  } else if (key === "store") {
    const name = boundedStr(raw.name, 50);
    const cs_phone = boundedStr(raw.cs_phone, 30);
    const cs_hours = boundedStr(raw.cs_hours, 100);
    if (name === null || cs_phone === null || cs_hours === null) {
      return NextResponse.json({ error: "스토어 정보가 올바르지 않습니다." }, { status: 400 });
    }
    value = { name, cs_phone, cs_hours };
  } else {
    return NextResponse.json({ error: "허용되지 않은 설정 키입니다." }, { status: 400 });
  }

  const { error } = await service
    .from("settings")
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });

  if (error) {
    console.error("[admin/settings PUT]", error);
    return NextResponse.json({ error: "설정을 저장하지 못했습니다." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, key, value });
}
