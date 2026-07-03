"use client";

import { useState, useSyncExternalStore, type FormEvent, type ReactNode } from "react";

export interface CampaignGateProps {
  /** 캠페인 토큰 — 세션 스토리지 기억 키로 사용 */
  token: string;
  /** 서버에서 계산한 sha256(대문자 정규화 코드) hex — 평문 코드는 클라이언트로 내려보내지 않는다 */
  codeHash: string;
  children: ReactNode;
}

const storageKey = (token: string) => `daleum_vip_gate_${token}`;
const emptySubscribe = () => () => {};

/** 세션 스토리지에 기억된 게이트 해시 — 서버/hydration 시점에는 undefined */
function useStoredHash(token: string): string | null | undefined {
  return useSyncExternalStore(
    emptySubscribe,
    () => {
      try {
        return sessionStorage.getItem(storageKey(token));
      } catch {
        return null;
      }
    },
    () => undefined
  );
}

/** 입력 코드를 서버와 동일하게 정규화(trim + 대문자) 후 SHA-256 hex */
async function hashCode(input: string): Promise<string | null> {
  try {
    const data = new TextEncoder().encode(input.trim().toUpperCase());
    const digest = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    return null;
  }
}

/**
 * require_code 캠페인의 열람 게이트.
 * 코드가 맞으면 세션 스토리지에 기억해 새로고침에도 다시 묻지 않는다.
 * (표시용 소프트 게이트 — 금액은 어차피 주문 시 서버가 재검증한다)
 */
export default function CampaignGate({ token, codeHash, children }: CampaignGateProps) {
  const stored = useStoredHash(token);
  const [manualUnlock, setManualUnlock] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // undefined = 스토리지 확인 전 (서버 렌더/hydration 직후)
  const checking = stored === undefined;
  const unlocked = manualUnlock || (!checking && stored === codeHash);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!code.trim() || pending) return;
    setPending(true);
    setError(null);

    const hashed = await hashCode(code);
    if (hashed && hashed === codeHash) {
      try {
        sessionStorage.setItem(storageKey(token), codeHash);
      } catch {
        // 저장 실패해도 이번 세션 열람은 허용
      }
      setManualUnlock(true);
    } else {
      setError(
        hashed ? "유효하지 않은 초대 코드입니다." : "이 브라우저에서는 코드를 확인할 수 없습니다."
      );
    }
    setPending(false);
  };

  if (unlocked) return <>{children}</>;

  return (
    <section className="flex flex-1 flex-col items-center justify-center px-6 py-32 text-center">
      <div
        className={`w-full max-w-md transition-opacity duration-700 ease-hall ${
          checking ? "opacity-0" : "opacity-100"
        }`}
      >
        <span aria-hidden className="mx-auto mb-8 block h-10 w-px bg-brass-500/60" />
        <p className="label-caps text-brass-300">Private Invitation</p>
        <h1 className="headline-serif mt-4 text-2xl text-cream-50 md:text-3xl">
          코드로 보호된 초대장입니다.
        </h1>
        <p className="mt-4 text-sm text-cream-200/55">
          초대장과 함께 전달받으신 코드를 입력해 주세요.
        </p>

        <form onSubmit={handleSubmit} className="mt-10">
          <label htmlFor="campaign-code" className="sr-only">
            초대 코드
          </label>
          <input
            id="campaign-code"
            type="text"
            value={code}
            onChange={(e) => {
              setCode(e.target.value.toUpperCase().slice(0, 50));
              if (error) setError(null);
            }}
            placeholder="INVITATION CODE"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            className="krw w-full border-b border-cream-50/25 bg-transparent py-3.5 text-center text-lg uppercase tracking-[0.3em] text-cream-50 outline-none transition-colors duration-500 placeholder:text-cream-50/25 placeholder:tracking-[0.22em] focus:border-brass-300"
          />
          <p
            role="alert"
            className={`mt-4 min-h-5 text-[13px] text-signal-amber transition-opacity duration-300 ${
              error ? "opacity-100" : "opacity-0"
            }`}
          >
            {error ?? " "}
          </p>
          <button
            type="submit"
            disabled={pending || !code.trim()}
            className="label-caps mt-6 inline-flex h-12 min-w-52 items-center justify-center border border-brass-500/60 px-10 text-brass-300 transition-colors duration-500 ease-hall hover:bg-brass-500/10 disabled:cursor-not-allowed disabled:border-cream-50/15 disabled:text-cream-50/30"
          >
            {pending ? "확인 중" : "초대장 열기"}
          </button>
        </form>
      </div>
    </section>
  );
}
