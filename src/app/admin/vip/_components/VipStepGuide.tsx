"use client";

/* ============================================================
   VIP 4개 탭이 서로 어떤 관계인지 알려 주는 진행 안내.

   왜 만들었나:
   대표가 VIP 관리에 처음 들어와 '멤버' 탭부터 열면 빈 표와 '멤버 추가' 버튼만 보인다.
   눌러서 고객까지 골랐는데 저장이 거부되고(그룹이 없으니까), 왜 거부됐는지도
   무엇을 먼저 해야 하는지도 화면이 말해 주지 않아 그대로 멈췄다.
   그룹 → 멤버/입장코드 → 상품별 전용가 라는 순서를 아는 사람은 개발자뿐이었다.

   그래서 순서를 화면 맨 위에 못 박고, 이미 끝난 단계에는 체크를 붙인다.
   각 단계를 누르면 그 탭으로 간다 — 안내가 곧 이동 수단이 되게.
   ============================================================ */

import { Check } from "lucide-react";

export interface VipStep {
  key: string;
  title: string;
  description: string;
  done: boolean;
}

export interface VipStepGuideProps {
  steps: VipStep[];
  activeKey: string;
  onGo: (key: string) => void;
}

export default function VipStepGuide({ steps, activeKey, onGo }: VipStepGuideProps) {
  return (
    <ol className="mb-5 grid gap-2 sm:grid-cols-3">
      {steps.map((step, i) => {
        const active = step.key === activeKey;
        return (
          <li key={step.key}>
            <button
              type="button"
              onClick={() => onGo(step.key)}
              className={`flex h-full w-full items-start gap-2.5 border px-3.5 py-3 text-left transition-colors ${
                active
                  ? "border-forest-600 bg-forest-50"
                  : "border-ink-200 bg-cream-50 hover:border-forest-600"
              }`}
            >
              <span
                aria-hidden
                className={`mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] ${
                  step.done ? "bg-forest-700 text-cream-50" : "border border-ink-300 text-ink-400"
                }`}
              >
                {step.done ? <Check size={12} strokeWidth={2} /> : i + 1}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium text-ink-900">
                  {step.title}
                  {step.done && <span className="ml-1.5 text-xs text-forest-700">완료</span>}
                </span>
                <span className="mt-0.5 block text-xs leading-relaxed text-ink-500">
                  {step.description}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
