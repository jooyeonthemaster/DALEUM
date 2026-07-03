"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import RevealText from "@/components/shop/RevealText";

const INPUT =
  "h-12 w-full border border-ink-200 bg-transparent px-3.5 text-sm text-ink-900 transition-colors placeholder:text-ink-300 focus:border-forest-600 focus-visible:outline-none";

function mapAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials"))
    return "이메일 또는 비밀번호가 올바르지 않습니다.";
  if (m.includes("email not confirmed"))
    return "이메일 인증이 완료되지 않았습니다. 받은메일함의 인증 메일을 확인해 주세요.";
  if (m.includes("too many") || m.includes("rate limit"))
    return "시도가 너무 많았습니다. 잠시 후 다시 시도해 주세요.";
  return "로그인에 실패했습니다. 잠시 후 다시 시도해 주세요.";
}

export default function LoginForm({
  next,
  initialError,
}: {
  next: string;
  initialError: string | null;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(initialError);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (loading) return;
    if (!email.trim() || !password) {
      setError("이메일과 비밀번호를 입력해 주세요.");
      return;
    }
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (signInError) {
      setError(mapAuthError(signInError.message));
      setLoading(false);
      return;
    }

    router.replace(next);
    router.refresh();
  };

  return (
    <div className="w-full max-w-md border border-ink-200 bg-cream-50 px-7 py-10 md:px-10 md:py-12">
      <p className="label-caps text-forest-600">Member</p>
      <RevealText
        as="h1"
        className="headline-serif mt-3 text-3xl text-ink-900"
        text="어서 오세요"
        delay={0.3}
      />
      <p className="mt-3 text-sm leading-relaxed text-ink-500">
        다름의 발효 식탁에 오신 것을 환영합니다.
      </p>

      <form onSubmit={onSubmit} className="mt-9 space-y-4" noValidate>
        <div>
          <label htmlFor="login-email" className="mb-1.5 block text-[13px] text-ink-600">
            이메일
          </label>
          <input
            id="login-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="daleum@daleum.kr"
            className={INPUT}
          />
        </div>
        <div>
          <label htmlFor="login-password" className="mb-1.5 block text-[13px] text-ink-600">
            비밀번호
          </label>
          <input
            id="login-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="비밀번호를 입력해 주세요"
            className={INPUT}
          />
        </div>

        {error && (
          <p role="alert" className="text-[13px] leading-relaxed text-signal-red">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="mt-2 h-12 w-full bg-forest-700 text-sm font-medium text-cream-50 transition-colors hover:bg-forest-800 disabled:opacity-50"
        >
          {loading ? "로그인 중…" : "로그인"}
        </button>
      </form>

      <div className="hairline-t mt-9 pt-6 text-center text-[13px] text-ink-500">
        아직 회원이 아니신가요?{" "}
        <Link
          href={next !== "/" ? `/signup?next=${encodeURIComponent(next)}` : "/signup"}
          className="link-line font-medium text-ink-900"
        >
          회원가입
        </Link>
      </div>
    </div>
  );
}
