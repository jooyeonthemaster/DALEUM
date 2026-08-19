import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { CACHE_TAGS } from "@/lib/cache";
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

/** 숫자와 하이픈만 — 국번 포함 9자리 이상이어야 실제로 걸리는 번호다 */
const PHONE_PATTERN = /^[0-9][0-9-]{7,}[0-9]$/;

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
    // 세 항목 모두 필수다. 예전에는 빈 문자열도 통과해서, 화면에서 회색 예시 문구를
    // 저장된 값으로 착각한 채 다른 항목만 고치고 저장하면 전화번호가 빈 값으로 확정됐다.
    // 이 값이 고객 화면에 연결되는 순간 고객센터 번호가 사라진 채 노출된다.
    if (name.length === 0) {
      return NextResponse.json(
        { error: "스토어 이름을 입력해 주세요.", field: "name" },
        { status: 400 }
      );
    }
    if (cs_phone.length === 0) {
      return NextResponse.json(
        { error: "고객센터 전화번호를 입력해 주세요.", field: "cs_phone" },
        { status: 400 }
      );
    }
    if (!PHONE_PATTERN.test(cs_phone)) {
      return NextResponse.json(
        {
          error: "전화번호는 숫자와 하이픈(-)만 써서 입력해 주세요. 예: 031-963-3375",
          field: "cs_phone",
        },
        { status: 400 }
      );
    }
    if (cs_hours.length === 0) {
      return NextResponse.json(
        { error: "고객센터 운영시간을 입력해 주세요.", field: "cs_hours" },
        { status: 400 }
      );
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

  // 캐시 계층에서 settings 태그를 쓰는 것은 getCachedShippingSettings 하나뿐이다.
  // key === "store" 는 대응하는 캐시 항목이 없으므로 무효화하지 않는다 —
  // 무해하긴 하지만, 굳이 부르면 관계없는 배송비 캐시만 헛되이 만료된다.
  //
  // ⚠ store 값(스토어 이름·고객센터 전화·운영시간)은 지금 **아무 화면도 읽지 않는다.**
  // 고객 화면은 전부 lib/constants.ts 의 COMPANY 상수를 쓴다(Footer, 주문완료, 회사소개,
  // 상품 상세, 이용약관, 업소용 문의 폼). 저장은 되지만 고객이 보는 번호는 바뀌지 않는다.
  // 관리자 화면에는 그 사실을 그대로 표시해 두었다 — 고객 화면 연결은 별도 소관이다.
  //
  // 두 번째 인자는 Next 16 에서 필수이며, { expire: 0 } 은 즉시 만료다.
  // "max"(stale-while-revalidate)를 쓰면 배송비를 저장한 직후에도 주문서에
  // 이전 배송비가 한 번 더 노출되므로 금액이 어긋난다. 즉시 만료여야 한다.
  if (key === "shipping") {
    revalidateTag(CACHE_TAGS.settings, { expire: 0 });
  }

  return NextResponse.json({ ok: true, key, value });
}
