"use client";

/* ============================================================
   "이 배너를 누르면 어디로 갈까" 를 고르는 칸.

   자유 입력 텍스트칸이던 자리다. 주소를 손으로 치게 하면 (1) 어떤 상품의
   주소가 무엇인지 관리자 안에서 알 방법이 없고 (2) 오타가 나도 저장은 성공해
   고객만 빈 화면을 만난다. 그래서 고르게 만들고, 직접 입력은 검사한다.
   ============================================================ */

import { useState } from "react";
import { Input, Select, Help } from "@/components/admin/Field";
import {
  FIXED_PAGES,
  buildLink,
  parseLink,
  validateCustomLink,
  type LinkMode,
  type LinkTargetsData,
} from "./link-targets";

const MODES: { key: LinkMode; label: string }[] = [
  { key: "none", label: "이동 안 함" },
  { key: "product", label: "상품 페이지" },
  { key: "category", label: "카테고리" },
  { key: "page", label: "고객 화면 한 곳" },
  { key: "custom", label: "직접 입력" },
];

export interface LinkPickerProps {
  /** 저장되는 주소 문자열 (빈 값이면 이동 안 함) */
  value: string;
  onChange: (next: string) => void;
  targets: LinkTargetsData;
  /** 상품·카테고리 목록을 아직 못 불러왔을 때 안내를 바꾼다 */
  loading?: boolean;
  /**
   * 주소를 비웠을 때 고객 화면이 실제로 어떻게 되는지 — **자리마다 다르다.**
   * 팝업은 링크가 없으면 '자세히 보기' 자체가 사라지지만(PopupDisplay.tsx:136),
   * 배너는 버튼이 그대로 남고 HomeHero.tsx:71-72 가 '상품 보기' → /products 로 렌더한다.
   * 그래서 '이동 안 함' 이라는 한 마디로 두 자리를 함께 설명하면 배너 쪽이 거짓말이 된다.
   * 비워 두면 팝업 기준(아무 데도 안 감)으로 말한다.
   */
  noneLabel?: string;
  noneHelp?: string;
}

export default function LinkPicker({
  value,
  onChange,
  targets,
  loading,
  noneLabel,
  noneHelp,
}: LinkPickerProps) {
  // 종류는 값에서 되짚을 수 있지만, 목록이 비어 값이 아직 없는 순간에
  // 고른 종류가 튕겨 나가면 안 되므로 화면 상태로 따로 들고 있는다.
  const [mode, setMode] = useState<LinkMode>(() => parseLink(value).mode);
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    // 바깥에서 값이 갈린 경우(다른 행을 열었다) — 종류를 그 값에 맞춘다.
    // 내가 바꾼 값은 emit 이 seen 까지 함께 옮기므로 여기로 들어오지 않는다
    // (그러지 않으면 "직접 입력" 칸에 /products 를 치는 순간 종류가 튀어 버린다).
    setSeen(value);
    setMode(parseLink(value).mode);
  }

  /** 내가 만든 변화 — 종류를 되짚지 않도록 seen 을 함께 옮긴다 */
  function emit(next: string) {
    setSeen(next);
    onChange(next);
  }

  const parsed = parseLink(value);
  // 직접 입력은 되짚지 않고 값을 그대로 보여 준다 — 타이핑 도중의 값은 어떤 종류로도 안 읽힌다
  const slug = mode === "custom" ? value : parsed.mode === mode ? parsed.slug : "";
  const customError = mode === "custom" ? validateCustomLink(slug) : null;

  function switchMode(next: LinkMode) {
    setMode(next);
    if (next === "none") return emit("");
    if (next === "product") {
      const first = targets.products[0]?.slug ?? "";
      return emit(first ? buildLink("product", first) : "");
    }
    if (next === "category") {
      const first = targets.categories[0]?.slug ?? "";
      return emit(first ? buildLink("category", first) : "");
    }
    if (next === "page") return emit(FIXED_PAGES[0].path);
    // 직접 입력은 빈 칸에서 시작한다. 예전에는 "/" 를 미리 넣어 두었는데,
    // 그 순간 붉은 경고가 먼저 뜨는 바람에 고르자마자 잘못한 기분이 들었다.
    emit("");
  }

  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {MODES.map((m) => (
          <button
            key={m.key}
            type="button"
            onClick={() => switchMode(m.key)}
            aria-pressed={mode === m.key}
            className={`border px-3 py-1.5 text-xs transition-colors ${
              mode === m.key
                ? "border-forest-700 bg-forest-700 text-cream-50"
                : "border-ink-200 bg-cream-50 text-ink-600 hover:border-forest-600 hover:text-forest-700"
            }`}
          >
            {m.key === "none" ? (noneLabel ?? m.label) : m.label}
          </button>
        ))}
      </div>

      {mode === "product" && (
        <Select
          className="mt-2.5 max-w-md"
          aria-label="이동할 상품"
          value={slug}
          onChange={(e) => emit(buildLink("product", e.target.value))}
        >
          {!slug && (
            <option value="">
              {loading ? "상품을 불러오는 중입니다…" : "고를 상품이 없습니다"}
            </option>
          )}
          {targets.products.map((p) => (
            <option key={p.slug} value={p.slug}>
              {p.name}
            </option>
          ))}
        </Select>
      )}

      {mode === "category" && (
        <Select
          className="mt-2.5 max-w-md"
          aria-label="이동할 카테고리"
          value={slug}
          onChange={(e) => emit(buildLink("category", e.target.value))}
        >
          {!slug && (
            <option value="">
              {loading ? "카테고리를 불러오는 중입니다…" : "고를 카테고리가 없습니다"}
            </option>
          )}
          {targets.categories.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.name}
            </option>
          ))}
        </Select>
      )}

      {mode === "page" && (
        <Select
          className="mt-2.5 max-w-md"
          aria-label="이동할 고객 화면"
          value={slug}
          onChange={(e) => emit(e.target.value)}
        >
          {FIXED_PAGES.map((p) => (
            <option key={p.path} value={p.path}>
              {p.label}
            </option>
          ))}
        </Select>
      )}

      {mode === "custom" && (
        <div className="mt-2.5">
          <Input
            aria-label="직접 입력한 주소"
            className="max-w-md"
            value={slug}
            onChange={(e) => emit(e.target.value)}
          />
          {!slug.trim() ? (
            // 아직 아무것도 안 쳤을 때까지 붉게 칠하면 "내가 뭘 잘못했나" 로 읽힌다
            <Help>
              우리 사이트 안이면 빗금(/)으로, 다른 사이트면 https:// 로 시작합니다.{" "}
              {noneHelp ?? "비워 두면 눌러도 아무 곳으로도 가지 않습니다."}
            </Help>
          ) : customError ? (
            <Help tone="error">{customError}</Help>
          ) : (
            <Help>확인했습니다. 고객이 누르면 이 주소로 이동합니다.</Help>
          )}
        </div>
      )}

      {mode === "none" && <Help>{noneHelp ?? "고객이 눌러도 아무 곳으로도 가지 않습니다."}</Help>}
    </div>
  );
}

/** 저장 전에 이 칸이 막아야 할 상태인지 — 폼이 물어본다 */
export function linkBlockingError(value: string): string | null {
  const { mode, slug } = parseLink(value);
  if (mode === "custom") return validateCustomLink(slug);
  return mode !== "none" && !slug ? "이동할 곳을 골라 주세요." : null;
}
