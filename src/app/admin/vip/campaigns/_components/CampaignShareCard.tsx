"use client";

import { useState } from "react";
import { ExternalLink, Link2 } from "lucide-react";
import { BTN_GHOST, BTN_PRIMARY, campaignUrl, copyText } from "../../_components/vipApi";

/* ============================================================
   저장된 캠페인의 '고객에게 보낼 링크' 카드.

   무엇이 문제였나:
   머리글이 영문 'Secret Link' 였고, 그 아래 <code> 블록에 난수 주소가
   그대로 박혀 있었다(/vip/s/nBxo_uu7fzGp). 코드 블록 생김새 때문에
   '내가 건드리면 안 되는 개발 영역'으로 읽혀, 링크 배포 자체를 개발자에게
   다시 부탁하게 만들었다.

   관리자에게 정말 필요한 것은 주소 원문이 아니라 '복사해서 보내기'다.
   그래서 기본은 버튼 세 개만 보이고, 주소가 꼭 필요한 사람만 펼쳐 본다.
   ============================================================ */

export interface CampaignShareCardProps {
  token: string;
  title: string;
  /** 복사 결과 등을 상위 알림줄에 알린다 */
  onNotice: (message: string) => void;
}

export default function CampaignShareCard({ token, title, onNotice }: CampaignShareCardProps) {
  const [revealed, setRevealed] = useState(false);

  async function copyLink() {
    const ok = await copyText(campaignUrl(token));
    onNotice(
      ok
        ? "링크가 복사되었습니다. 문자·카카오톡에 붙여넣어 고객에게 보내세요."
        : "복사하지 못했습니다. 브라우저가 복사를 막고 있는지 확인해 주세요."
    );
  }

  async function copyInvite() {
    const ok = await copyText(
      [
        `${title}`,
        "아래 링크에서 이번에만 드리는 가격으로 만나 보실 수 있습니다.",
        "",
        campaignUrl(token),
      ].join("\n")
    );
    onNotice(
      ok
        ? "안내 문구가 복사되었습니다. 인사말과 링크가 함께 들어 있습니다."
        : "복사하지 못했습니다. 브라우저가 복사를 막고 있는지 확인해 주세요."
    );
  }

  return (
    <div className="mb-6 border border-forest-600/40 bg-forest-50 p-5">
      <p className="text-sm font-medium text-forest-800">고객에게 보낼 링크</p>
      <p className="mt-1 text-xs leading-relaxed text-ink-500">
        이 링크를 받은 사람만 캠페인 페이지를 열 수 있습니다. 링크가 알려지면 누구나 볼 수 있으니
        게시판이나 공개 SNS에는 올리지 마세요.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" onClick={copyInvite} className={BTN_PRIMARY}>
          안내 문구 복사
        </button>
        <button
          type="button"
          onClick={copyLink}
          className={`inline-flex items-center gap-1.5 ${BTN_GHOST}`}
        >
          <Link2 size={14} strokeWidth={1.5} />
          링크만 복사
        </button>
        <a
          href={`/vip/s/${token}`}
          target="_blank"
          rel="noopener"
          className={`inline-flex items-center gap-1.5 ${BTN_GHOST}`}
        >
          고객 화면 미리보기
          <ExternalLink size={14} strokeWidth={1.5} />
        </a>
      </div>

      <button
        type="button"
        onClick={() => setRevealed((prev) => !prev)}
        className="mt-3 text-xs text-ink-500 underline-offset-2 transition-colors hover:text-forest-700 hover:underline"
      >
        {revealed ? "주소 감추기" : "주소 보기"}
      </button>
      {revealed && (
        <p className="mt-1.5 break-all border border-ink-200 bg-cream-50 px-3 py-2 text-xs text-ink-600">
          {campaignUrl(token)}
        </p>
      )}
    </div>
  );
}
