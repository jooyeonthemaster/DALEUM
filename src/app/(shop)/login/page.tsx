import type { Metadata } from "next";
import LoginForm from "./LoginForm";

export const metadata: Metadata = { title: "로그인" };

/** 오픈 리다이렉트 방지 — 내부 경로만 허용 */
function sanitizeNext(raw: string | undefined): string {
  if (!raw) return "/";
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return "/";
  return raw;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const next = sanitizeNext(sp.next);
  const initialError =
    sp.error === "auth"
      ? "인증 링크가 유효하지 않거나 만료되었습니다. 다시 로그인해 주세요."
      : null;

  return (
    <div className="flex flex-1 items-center justify-center px-5 py-16 md:py-24">
      <LoginForm next={next} initialError={initialError} />
    </div>
  );
}
