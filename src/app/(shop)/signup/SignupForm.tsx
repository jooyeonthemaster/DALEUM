"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Check } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import RevealText from "@/components/shop/RevealText";

const INPUT =
  "h-12 w-full border border-ink-200 bg-transparent px-3.5 text-sm text-ink-900 transition-colors placeholder:text-ink-300 focus:border-forest-600 focus-visible:outline-none";

/** 비밀번호 강도 0~3 */
function strengthOf(pw: string): 0 | 1 | 2 | 3 {
  if (!pw) return 0;
  let score = 0;
  if (pw.length >= 8) score++;
  if (/[a-zA-Z]/.test(pw) && /\d/.test(pw)) score++;
  if (/[^a-zA-Z0-9]/.test(pw) || pw.length >= 12) score++;
  return score as 0 | 1 | 2 | 3;
}

const STRENGTH_LABELS = ["", "약함", "보통", "안전"] as const;
const STRENGTH_COLORS = ["", "bg-signal-red", "bg-signal-amber", "bg-forest-600"] as const;

function mapSignupError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("already registered") || m.includes("already been registered"))
    return "이미 가입된 이메일입니다. 로그인해 주세요.";
  if (m.includes("invalid") && m.includes("email"))
    return "이메일 주소 형식이 올바르지 않습니다.";
  if (m.includes("password"))
    return "비밀번호가 조건을 충족하지 않습니다. 8자 이상으로 입력해 주세요.";
  if (m.includes("rate limit") || m.includes("too many"))
    return "요청이 많아 잠시 후 다시 시도해 주세요.";
  return "회원가입에 실패했습니다. 잠시 후 다시 시도해 주세요.";
}

export default function SignupForm({ next }: { next: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [marketing, setMarketing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  /** 이메일 확인이 필요한 가입 완료 상태 */
  const [sentTo, setSentTo] = useState<string | null>(null);

  const strength = strengthOf(password);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (loading) return;

    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    const phoneDigits = phone.replace(/\D/g, "");

    if (!trimmedName) return setError("이름을 입력해 주세요.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail))
      return setError("이메일 주소를 정확히 입력해 주세요.");
    if (!/^01\d{8,9}$/.test(phoneDigits))
      return setError("휴대폰 번호를 정확히 입력해 주세요. (예: 01012345678)");
    if (password.length < 8) return setError("비밀번호는 8자 이상으로 입력해 주세요.");
    if (password !== password2) return setError("비밀번호가 서로 일치하지 않습니다.");

    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: trimmedEmail,
      password,
      options: {
        data: {
          name: trimmedName,
          phone: phoneDigits,
          marketing_opt_in: marketing,
        },
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });

    if (signUpError) {
      setError(mapSignupError(signUpError.message));
      setLoading(false);
      return;
    }

    // 이메일 확인이 켜진 프로젝트에서 기존 회원 이메일로 가입하면
    // identities가 빈 배열로 돌아온다 (정보 노출 방지 동작)
    if (data.user && (data.user.identities?.length ?? 0) === 0) {
      setError("이미 가입된 이메일입니다. 로그인해 주세요.");
      setLoading(false);
      return;
    }

    if (data.session && data.user) {
      // 이메일 확인 없이 즉시 로그인되는 설정 — 프로필에 동의 여부 반영 후 이동
      await supabase
        .from("profiles")
        .update({ marketing_opt_in: marketing, name: trimmedName, phone: phoneDigits })
        .eq("id", data.user.id);
      router.replace(next);
      router.refresh();
      return;
    }

    // 이메일 확인 필요 — 안내 화면으로 전환
    setSentTo(trimmedEmail);
    setLoading(false);
  };

  if (sentTo) {
    return (
      <div className="w-full max-w-md border border-ink-200 bg-cream-50 px-7 py-12 text-center md:px-10 md:py-14">
        <span className="mx-auto mb-8 block h-10 w-px bg-ink-200" aria-hidden />
        <h1 className="headline-serif text-2xl text-ink-900">메일함을 확인해 주세요.</h1>
        <p className="mt-4 text-sm leading-relaxed text-ink-500">
          <span className="font-medium text-ink-900">{sentTo}</span> 주소로
          <br />
          인증 메일을 보내드렸습니다. 메일의 링크를 누르면 가입이 완료됩니다.
        </p>
        <p className="mt-3 text-xs leading-relaxed text-ink-400">
          메일이 보이지 않으면 스팸함도 확인해 주세요.
        </p>
        <Link
          href="/login"
          className="label-caps mt-10 inline-block border border-ink-900 px-9 py-3.5 text-ink-900 transition-colors duration-500 hover:bg-ink-900 hover:text-cream-50"
        >
          로그인으로 이동
        </Link>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md border border-ink-200 bg-cream-50 px-7 py-10 md:px-10 md:py-12">
      <p className="label-caps text-forest-600">Join Us</p>
      <RevealText
        as="h1"
        className="headline-serif mt-3 text-3xl text-ink-900"
        text="회원가입"
        delay={0.3}
      />
      <p className="mt-3 text-sm leading-relaxed text-ink-500">
        발효가 완성한 곤약의 식탁, 다름과 함께하세요.
      </p>

      <form onSubmit={onSubmit} className="mt-9 space-y-4" noValidate>
        <div>
          <label htmlFor="signup-name" className="mb-1.5 block text-[13px] text-ink-600">
            이름
          </label>
          <input
            id="signup-name"
            type="text"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="이름을 입력해 주세요"
            className={INPUT}
          />
        </div>
        <div>
          <label htmlFor="signup-email" className="mb-1.5 block text-[13px] text-ink-600">
            이메일
          </label>
          <input
            id="signup-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="daleum@daleum.kr"
            className={INPUT}
          />
        </div>
        <div>
          <label htmlFor="signup-phone" className="mb-1.5 block text-[13px] text-ink-600">
            휴대폰 번호
          </label>
          <input
            id="signup-phone"
            type="tel"
            autoComplete="tel"
            inputMode="numeric"
            value={phone}
            onChange={(e) => setPhone(e.target.value.replace(/[^\d-]/g, ""))}
            placeholder="01012345678"
            className={INPUT}
          />
        </div>
        <div>
          <label htmlFor="signup-password" className="mb-1.5 block text-[13px] text-ink-600">
            비밀번호
          </label>
          <input
            id="signup-password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="8자 이상, 영문과 숫자 조합 권장"
            className={INPUT}
          />
          {password && (
            <div className="mt-2 flex items-center gap-2">
              <div className="flex flex-1 gap-1" aria-hidden>
                {[1, 2, 3].map((step) => (
                  <span
                    key={step}
                    className={`h-0.5 flex-1 ${
                      strength >= step ? STRENGTH_COLORS[strength] : "bg-ink-200"
                    }`}
                  />
                ))}
              </div>
              <span className="w-8 text-right text-[11px] text-ink-500">
                {STRENGTH_LABELS[strength]}
              </span>
            </div>
          )}
        </div>
        <div>
          <label htmlFor="signup-password2" className="mb-1.5 block text-[13px] text-ink-600">
            비밀번호 확인
          </label>
          <input
            id="signup-password2"
            type="password"
            autoComplete="new-password"
            value={password2}
            onChange={(e) => setPassword2(e.target.value)}
            placeholder="비밀번호를 한 번 더 입력해 주세요"
            className={INPUT}
          />
          {password2 && password !== password2 && (
            <p className="mt-1.5 text-xs text-signal-red">비밀번호가 서로 일치하지 않습니다.</p>
          )}
        </div>

        <button
          type="button"
          onClick={() => setMarketing((v) => !v)}
          aria-pressed={marketing}
          className="flex w-full items-start gap-2.5 pt-1 text-left"
        >
          <span
            aria-hidden
            className={`mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center border transition-colors ${
              marketing ? "border-forest-700 bg-forest-700" : "border-ink-300 bg-transparent"
            }`}
          >
            {marketing && <Check size={13} strokeWidth={1.5} className="text-cream-50" />}
          </span>
          <span className="text-[13px] leading-relaxed text-ink-600">
            할인 소식과 신제품 이야기를 이메일로{" "}
            <span className="whitespace-nowrap">
              받아볼게요. <span className="text-ink-400">(선택)</span>
            </span>
          </span>
        </button>

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
          {loading ? "가입 처리 중…" : "가입하기"}
        </button>

        <p className="pt-1 text-center text-[11px] leading-relaxed text-ink-400">
          가입하면 다름의 이용약관과 개인정보 처리방침에 동의하게 됩니다.
        </p>
      </form>

      <div className="hairline-t mt-8 pt-6 text-center text-[13px] text-ink-500">
        이미 회원이신가요?{" "}
        <Link
          href={next !== "/" ? `/login?next=${encodeURIComponent(next)}` : "/login"}
          className="link-line font-medium text-ink-900"
        >
          로그인
        </Link>
      </div>
    </div>
  );
}
