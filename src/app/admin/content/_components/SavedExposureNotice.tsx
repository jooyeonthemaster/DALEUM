"use client";

/* ============================================================
   저장 직후 안내 — "저장했다" 와 "고객에게 나간다" 는 다른 말이다.

   왜 만들었나:
   배너·팝업 저장 뒤 안내는 조건 없이 "저장했습니다. 홈 화면에서 확인해 보세요" 였다.
   그런데 새로 만든 것은 sort_order 를 rows.length 로 받아 **맨 뒤**에 붙고
   (BannersTab.tsx / PopupsTab.tsx 의 save()), 홈은 조건에 맞는 **첫 한 건만** 내보낸다
   (src/app/(shop)/page.tsx 배너 64-67행·팝업 86-87행).
   즉 이미 나가는 배너가 있으면 방금 만든 것은 아무리 기다려도 홈에 없다.
   대표가 홈을 열어 확인하고 "저장이 안 됐나" 싶어 같은 배너를 여러 개 만들던 자리다.

   같은 화면의 노출 배지는 이미 '대기 — 앞 순서가 내려가면 나갑니다' 라고 정확히 말하고
   있었다. 저장 안내만 그 사실을 모르고 있었으므로, 여기서 같은 판정을 그대로 쓴다.
   ============================================================ */

import { TOGGLE_LABELS } from "@/lib/admin-labels";
import { StorefrontLink } from "../shared";
import type { ExposureState } from "./ExposureBadge";

export interface SavedExposureNoticeProps {
  /** 방금 저장한 행의 지금 노출 상태 — 목록을 다시 읽은 뒤 계산해 넘긴다. 못 찾으면 null */
  state: ExposureState | null;
  /** '배너' / '팝업' — 문장에 그대로 들어간다 */
  kind: string;
  /** 지금 대신 나가고 있는 것의 이름 (대기 상태일 때만 쓴다) */
  blockedBy?: string | null;
  /** 상태와 무관하게 늘 덧붙일 말 (팝업의 24시간 규칙 등) */
  extra?: string;
}

/**
 * 받침에 따라 조사를 고른다. '이 팝업는 대기 중입니다' 같은 말이 화면에 나가면
 * 그 자체로 만든 티가 나고, 대표는 문장을 두 번 읽게 된다.
 * 배너(받침 없음) → 가/는, 팝업(받침 ㅂ) → 이/은.
 */
function josa(word: string, withJong: string, withoutJong: string): string {
  const code = (word.trim().at(-1) ?? "").charCodeAt(0);
  if (Number.isNaN(code) || code < 0xac00 || code > 0xd7a3) return withoutJong;
  return (code - 0xac00) % 28 === 0 ? withoutJong : withJong;
}

/** 저장은 됐지만 고객에게는 아직 안 나가는 상태들 — 초록이 아니라 노란 톤으로 말한다 */
function sentence(state: ExposureState | null, kind: string, blockedBy?: string | null): string {
  const subject = josa(kind, "이", "가"); // 배너가 / 팝업이
  const topic = josa(kind, "은", "는"); // 배너는 / 팝업은
  switch (state) {
    case "live":
      return `저장했습니다. 지금 고객 화면에 이 ${kind}${subject} 나가고 있습니다.`;
    case "queued":
      // 이름 뒤에 조사를 붙이면 관리자가 지은 이름의 받침까지 따라야 한다 —
      // 이름은 '…입니다' 로 끊고, 조사는 우리가 정한 낱말(배너/팝업)에만 붙인다.
      return blockedBy
        ? `저장했습니다. 다만 지금 고객 화면에 나가고 있는 것은 「${blockedBy}」입니다. 방금 저장한 ${kind}${topic} 대기 중이니, 목록에서 맨 위로 올리면 바로 나갑니다.`
        : `저장했습니다. 다만 앞 순서가 먼저 나가고 있어 이 ${kind}${topic} 대기 중입니다. 목록에서 맨 위로 올리면 바로 나갑니다.`;
    case "scheduled":
      return `저장했습니다. 다만 시작일이 아직 오지 않아 지금은 고객 화면에 나오지 않습니다.`;
    case "ended":
      return `저장했습니다. 다만 종료일이 지나 고객 화면에 나오지 않습니다. 노출 기간을 다시 잡아 주세요.`;
    case "hidden":
      return `저장했습니다. 다만 '${TOGGLE_LABELS.off}' 상태라 고객에게 보이지 않습니다. 목록의 스위치를 켜면 나갑니다.`;
    case "noimage":
      return `저장했습니다. 다만 사진이 없어 고객 화면에 나갈 수 없습니다.`;
    default:
      return `저장했습니다.`;
  }
}

export default function SavedExposureNotice({
  state,
  kind,
  blockedBy,
  extra,
}: SavedExposureNoticeProps) {
  const live = state === "live";
  return (
    <div
      className={`mb-4 border px-4 py-3 text-sm ${
        live
          ? "border-forest-600 bg-forest-50 text-forest-800"
          : "border-[#e8d6ae] bg-[#fbf3e2] text-signal-amber"
      }`}
    >
      {sentence(state, kind, blockedBy)}
      {extra && ` ${extra}`}{" "}
      {/* 지금 나가는 것이 아니면 홈으로 보내 봐야 방금 만든 것이 없다 — 헛걸음을 시키지 않는다 */}
      {live && <StorefrontLink href="/">홈 화면에서 확인해 보세요</StorefrontLink>}
    </div>
  );
}
