"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import Reveal from "@/components/shop/Reveal";
import Skeleton from "@/components/shop/Skeleton";
import ShopModal from "./ShopModal";

const INPUT =
  "h-11 w-full border border-ink-200 bg-transparent px-3.5 text-sm text-ink-900 transition-colors placeholder:text-ink-300 focus:border-forest-600 focus-visible:outline-none";

interface ProfileState {
  email: string;
  name: string;
  phone: string;
  marketing_opt_in: boolean;
}

type Feedback = { tone: "ok" | "error"; text: string } | null;

function FeedbackText({ feedback }: { feedback: Feedback }) {
  if (!feedback) return null;
  return (
    <p
      role={feedback.tone === "error" ? "alert" : "status"}
      className={`mt-3 text-[13px] ${
        feedback.tone === "ok" ? "text-forest-700" : "text-signal-red"
      }`}
    >
      {feedback.text}
    </p>
  );
}

/** 회원 정보 — 기본 정보 수정 / 비밀번호 변경 / 마케팅 동의 / 로그아웃 / 회원 탈퇴 */
export default function ProfileClient() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  const [profile, setProfile] = useState<ProfileState | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // 기본 정보
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [infoBusy, setInfoBusy] = useState(false);
  const [infoFeedback, setInfoFeedback] = useState<Feedback>(null);

  // 비밀번호
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [newPw2, setNewPw2] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [pwFeedback, setPwFeedback] = useState<Feedback>(null);

  // 마케팅
  const [marketing, setMarketing] = useState(false);
  const [marketingBusy, setMarketingBusy] = useState(false);

  // 탈퇴
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [withdrawPw, setWithdrawPw] = useState("");
  const [withdrawAgree, setWithdrawAgree] = useState(false);
  const [withdrawBusy, setWithdrawBusy] = useState(false);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);

  const load = useCallback(() => {
    return supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      setUserId(user.id);
      return supabase
        .from("profiles")
        .select("email, name, phone, marketing_opt_in")
        .eq("id", user.id)
        .maybeSingle()
        .then(({ data, error }) => {
          if (error || !data) {
            setLoadError("회원 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
            return;
          }
          const p: ProfileState = {
            email: data.email ?? user.email ?? "",
            name: data.name ?? "",
            phone: data.phone ?? "",
            marketing_opt_in: Boolean(data.marketing_opt_in),
          };
          setProfile(p);
          setName(p.name);
          setPhone(p.phone);
          setMarketing(p.marketing_opt_in);
        });
    });
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  const saveInfo = async (e: FormEvent) => {
    e.preventDefault();
    if (infoBusy || !userId) return;
    const trimmedName = name.trim();
    const phoneDigits = phone.replace(/\D/g, "");
    if (!trimmedName) return setInfoFeedback({ tone: "error", text: "이름을 입력해 주세요." });
    if (phoneDigits && !/^01\d{8,9}$/.test(phoneDigits))
      return setInfoFeedback({
        tone: "error",
        text: "휴대폰 번호를 정확히 입력해 주세요. (예: 01012345678)",
      });

    setInfoBusy(true);
    setInfoFeedback(null);
    const { error: profileError } = await supabase
      .from("profiles")
      .update({ name: trimmedName, phone: phoneDigits })
      .eq("id", userId);
    // 헤더 인사 등에 쓰이는 auth 메타데이터도 함께 동기화
    const { error: metaError } = await supabase.auth.updateUser({
      data: { name: trimmedName, phone: phoneDigits },
    });
    setInfoBusy(false);

    if (profileError || metaError) {
      setInfoFeedback({
        tone: "error",
        text: "저장에 실패했습니다. 잠시 후 다시 시도해 주세요.",
      });
      return;
    }
    setInfoFeedback({ tone: "ok", text: "회원 정보가 저장되었습니다." });
    router.refresh();
  };

  const changePassword = async (e: FormEvent) => {
    e.preventDefault();
    if (pwBusy || !profile) return;
    if (!currentPw)
      return setPwFeedback({ tone: "error", text: "현재 비밀번호를 입력해 주세요." });
    if (newPw.length < 8)
      return setPwFeedback({ tone: "error", text: "새 비밀번호는 8자 이상으로 입력해 주세요." });
    if (newPw !== newPw2)
      return setPwFeedback({ tone: "error", text: "새 비밀번호가 서로 일치하지 않습니다." });
    if (newPw === currentPw)
      return setPwFeedback({
        tone: "error",
        text: "현재 비밀번호와 다른 비밀번호를 사용해 주세요.",
      });

    setPwBusy(true);
    setPwFeedback(null);

    // 현재 비밀번호 확인
    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email: profile.email,
      password: currentPw,
    });
    if (verifyError) {
      setPwBusy(false);
      setPwFeedback({ tone: "error", text: "현재 비밀번호가 일치하지 않습니다." });
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({ password: newPw });
    setPwBusy(false);
    if (updateError) {
      setPwFeedback({
        tone: "error",
        text: "비밀번호 변경에 실패했습니다. 잠시 후 다시 시도해 주세요.",
      });
      return;
    }
    setCurrentPw("");
    setNewPw("");
    setNewPw2("");
    setPwFeedback({ tone: "ok", text: "비밀번호가 변경되었습니다." });
  };

  const toggleMarketing = async () => {
    if (marketingBusy || !userId) return;
    const next = !marketing;
    setMarketing(next); // 낙관적 반영
    setMarketingBusy(true);
    const { error } = await supabase
      .from("profiles")
      .update({ marketing_opt_in: next })
      .eq("id", userId);
    setMarketingBusy(false);
    if (error) setMarketing(!next); // 실패 시 되돌림
  };

  const logout = async () => {
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  };

  const closeWithdraw = () => {
    if (withdrawBusy) return;
    setWithdrawOpen(false);
    setWithdrawPw("");
    setWithdrawAgree(false);
    setWithdrawError(null);
  };

  const withdraw = async () => {
    if (withdrawBusy) return;
    if (!withdrawPw) return setWithdrawError("비밀번호를 입력해 주세요.");
    if (!withdrawAgree) return setWithdrawError("안내 사항을 확인하고 동의해 주세요.");
    setWithdrawBusy(true);
    setWithdrawError(null);
    try {
      const res = await fetch("/api/mypage/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: withdrawPw }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { error?: string } | null;
        setWithdrawError(json?.error ?? "탈퇴 처리에 실패했습니다. 잠시 후 다시 시도해 주세요.");
        setWithdrawBusy(false);
        return;
      }
      // 계정은 이미 삭제됨 — 로컬 세션 정리 후 홈으로
      await supabase.auth.signOut().catch(() => undefined);
      window.location.href = "/";
    } catch {
      setWithdrawError("네트워크 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.");
      setWithdrawBusy(false);
    }
  };

  if (loadError) {
    return (
      <div>
        <h2 className="headline-serif mb-6 text-xl text-ink-900 md:text-[1.35rem]">회원 정보</h2>
        <p role="alert" className="text-sm text-signal-red">
          {loadError}
        </p>
      </div>
    );
  }

  if (!profile) {
    return (
      <div aria-hidden>
        <Skeleton className="h-6 w-24" />
        <div className="mt-6 space-y-4">
          <Skeleton className="h-56 w-full" />
          <Skeleton className="h-56 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2 className="headline-serif mb-6 text-xl text-ink-900 md:text-[1.35rem]">회원 정보</h2>

      <div className="space-y-4">
        {/* 기본 정보 */}
        <Reveal as="section" variant="fade" className="border border-ink-200 p-6 md:p-8">
          <h3 className="text-sm font-semibold text-ink-900">기본 정보</h3>
          <form onSubmit={saveInfo} className="mt-5 max-w-sm space-y-4" noValidate>
            <div>
              <span className="mb-1.5 block text-[13px] text-ink-600">이메일</span>
              <p className="flex h-11 items-center border border-ink-100 bg-cream-100 px-3.5 text-sm text-ink-500">
                {profile.email}
              </p>
            </div>
            <div>
              <label htmlFor="profile-name" className="mb-1.5 block text-[13px] text-ink-600">
                이름
              </label>
              <input
                id="profile-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={50}
                className={INPUT}
              />
            </div>
            <div>
              <label htmlFor="profile-phone" className="mb-1.5 block text-[13px] text-ink-600">
                휴대폰 번호
              </label>
              <input
                id="profile-phone"
                type="tel"
                inputMode="numeric"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/[^\d-]/g, ""))}
                placeholder="01012345678"
                className={INPUT}
              />
            </div>
            <button
              type="submit"
              disabled={infoBusy}
              className="h-11 bg-forest-700 px-6 text-sm text-cream-50 transition-colors hover:bg-forest-800 disabled:opacity-50"
            >
              {infoBusy ? "저장 중…" : "저장"}
            </button>
            <FeedbackText feedback={infoFeedback} />
          </form>
        </Reveal>

        {/* 비밀번호 변경 */}
        <Reveal as="section" variant="fade" delay={0.08} className="border border-ink-200 p-6 md:p-8">
          <h3 className="text-sm font-semibold text-ink-900">비밀번호 변경</h3>
          <form onSubmit={changePassword} className="mt-5 max-w-sm space-y-4" noValidate>
            <div>
              <label htmlFor="pw-current" className="mb-1.5 block text-[13px] text-ink-600">
                현재 비밀번호
              </label>
              <input
                id="pw-current"
                type="password"
                autoComplete="current-password"
                value={currentPw}
                onChange={(e) => setCurrentPw(e.target.value)}
                className={INPUT}
              />
            </div>
            <div>
              <label htmlFor="pw-new" className="mb-1.5 block text-[13px] text-ink-600">
                새 비밀번호
              </label>
              <input
                id="pw-new"
                type="password"
                autoComplete="new-password"
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                placeholder="8자 이상"
                className={INPUT}
              />
            </div>
            <div>
              <label htmlFor="pw-new2" className="mb-1.5 block text-[13px] text-ink-600">
                새 비밀번호 확인
              </label>
              <input
                id="pw-new2"
                type="password"
                autoComplete="new-password"
                value={newPw2}
                onChange={(e) => setNewPw2(e.target.value)}
                className={INPUT}
              />
            </div>
            <button
              type="submit"
              disabled={pwBusy}
              className="h-11 border border-ink-900 px-6 text-sm text-ink-900 transition-colors hover:bg-ink-900 hover:text-cream-50 disabled:opacity-50"
            >
              {pwBusy ? "변경 중…" : "비밀번호 변경"}
            </button>
            <FeedbackText feedback={pwFeedback} />
          </form>
        </Reveal>

        {/* 마케팅 수신 동의 */}
        <Reveal as="section" variant="fade" delay={0.14} className="border border-ink-200 p-6 md:p-8">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold text-ink-900">마케팅 수신 동의</h3>
              <p className="mt-1.5 text-[13px] leading-relaxed text-ink-500">
                할인 소식과 신제품 이야기를 이메일로 보내드립니다.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={marketing}
              aria-label="마케팅 수신 동의"
              onClick={toggleMarketing}
              disabled={marketingBusy}
              className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-300 after:absolute after:-inset-y-2.5 after:-inset-x-2 after:content-[''] disabled:opacity-60 ${
                marketing ? "bg-forest-600" : "bg-ink-200"
              }`}
            >
              <span
                aria-hidden
                className={`absolute top-0.5 h-5 w-5 rounded-full bg-cream-50 transition-[left] duration-300 ease-hall ${
                  marketing ? "left-[22px]" : "left-0.5"
                }`}
              />
            </button>
          </div>
        </Reveal>

        {/* 계정 */}
        <Reveal as="section" variant="fade" delay={0.2} className="border border-ink-200 p-6 md:p-8">
          <h3 className="text-sm font-semibold text-ink-900">계정</h3>
          <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-3">
            <button
              type="button"
              onClick={logout}
              className="h-11 border border-ink-200 px-6 text-sm text-ink-700 transition-colors hover:border-ink-400 hover:text-ink-900"
            >
              로그아웃
            </button>
            <button
              type="button"
              onClick={() => setWithdrawOpen(true)}
              className="px-2 py-2.5 text-[13px] text-ink-400 transition-colors hover:text-signal-red"
            >
              회원 탈퇴
            </button>
          </div>
        </Reveal>
      </div>

      {/* 회원 탈퇴 확인 모달 */}
      <ShopModal
        open={withdrawOpen}
        onClose={closeWithdraw}
        title="회원 탈퇴"
        footer={
          <>
            <button
              type="button"
              onClick={closeWithdraw}
              disabled={withdrawBusy}
              className="h-11 border border-ink-200 px-5 text-sm text-ink-700 transition-colors hover:bg-cream-100 disabled:opacity-50"
            >
              취소
            </button>
            <button
              type="button"
              onClick={withdraw}
              disabled={withdrawBusy}
              className="h-11 bg-signal-red px-5 text-sm text-cream-50 transition-colors hover:bg-[#9c3c27] disabled:opacity-50"
            >
              {withdrawBusy ? "처리 중…" : "탈퇴하기"}
            </button>
          </>
        }
      >
        <p className="text-sm leading-relaxed text-ink-600">
          탈퇴하면 계정과 함께 배송지, 위시리스트, 작성한 리뷰가 모두 삭제되며 복구할 수
          없습니다. 주문 이력은 관련 법령에 따라 별도 보관됩니다.
        </p>
        <label htmlFor="withdraw-pw" className="mt-5 mb-1.5 block text-[13px] text-ink-600">
          본인 확인을 위해 비밀번호를 입력해 주세요.
        </label>
        <input
          id="withdraw-pw"
          type="password"
          autoComplete="current-password"
          value={withdrawPw}
          onChange={(e) => setWithdrawPw(e.target.value)}
          className={INPUT}
        />
        <button
          type="button"
          onClick={() => setWithdrawAgree((v) => !v)}
          aria-pressed={withdrawAgree}
          className="mt-3 flex min-h-11 items-center gap-2.5 text-left"
        >
          <span
            aria-hidden
            className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center border transition-colors ${
              withdrawAgree ? "border-signal-red bg-signal-red" : "border-ink-300"
            }`}
          >
            {withdrawAgree && <span className="block h-1.5 w-1.5 bg-cream-50" />}
          </span>
          <span className="text-[13px] text-ink-600">
            안내 사항을 확인했으며, 탈퇴에 동의합니다.
          </span>
        </button>
        {withdrawError && (
          <p role="alert" className="mt-3 text-[13px] text-signal-red">
            {withdrawError}
          </p>
        )}
      </ShopModal>
    </div>
  );
}
