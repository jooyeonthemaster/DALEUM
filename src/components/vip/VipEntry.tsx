"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { track } from "@/lib/analytics";

/**
 * /vip 코드 입장 폼 — 다크 풀스크린 중앙에 놓이는 클라이언트 파트.
 * 코드 검증 성공 시 그룹명을 보여주는 우아한 전환 뒤 /vip/shop으로 이동한다.
 */
export default function VipEntry() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [groupName, setGroupName] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = code.trim();
    if (!trimmed || pending || groupName) return;

    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/vip/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: trimmed }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        group?: { name: string; discount_rate: number };
        error?: string;
      };

      if (!res.ok || !data.group) {
        setError(data.error ?? "유효하지 않은 초대 코드입니다.");
        setPending(false);
        return;
      }

      track("vip_enter", { meta: { group: data.group.name } });
      setGroupName(data.group.name);
      // 환영 문구를 잠시 보여준 뒤 프라이빗 셀렉션으로
      timerRef.current = setTimeout(() => {
        router.push("/vip/shop");
      }, 1600);
    } catch {
      setError("일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.");
      setPending(false);
    }
  };

  return (
    <div className="relative w-full max-w-md text-center">
      {/* 입장 확인 — 우아한 교차 전환 */}
      <div
        aria-live="polite"
        className={`absolute inset-x-0 top-0 transition-all duration-700 ease-hall ${
          groupName ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0"
        }`}
      >
        <p className="label-caps text-brass-300">Welcome</p>
        <h2 className="headline-serif mt-4 text-2xl text-cream-50 md:text-3xl">
          {groupName ? `${groupName} 멤버로 확인되었습니다.` : ""}
        </h2>
        <p className="mt-4 text-sm text-cream-200/60">프라이빗 셀렉션으로 안내해 드립니다.</p>
      </div>

      {/* 코드 입력 폼 */}
      <form
        onSubmit={handleSubmit}
        className={`transition-all duration-700 ease-hall ${
          groupName ? "pointer-events-none -translate-y-3 opacity-0" : "translate-y-0 opacity-100"
        }`}
      >
        <label htmlFor="vip-code" className="sr-only">
          초대 코드
        </label>
        <input
          id="vip-code"
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
          disabled={pending}
          className="krw w-full border-b border-cream-50/25 bg-transparent py-3.5 text-center text-lg uppercase tracking-[0.3em] text-cream-50 outline-none transition-colors duration-500 placeholder:text-cream-50/25 placeholder:tracking-[0.22em] focus:border-brass-300 disabled:opacity-60"
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
          {pending ? "확인 중" : "입장하기"}
        </button>

        <p className="mt-12 text-[13px] text-cream-50/40">
          초대 코드가 없으신가요?{" "}
          <Link href="/products" className="link-line text-cream-200/80">
            스토어 둘러보기
          </Link>
        </p>
      </form>
    </div>
  );
}
