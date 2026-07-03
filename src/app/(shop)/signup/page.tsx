import type { Metadata } from "next";
import SignupForm from "./SignupForm";

export const metadata: Metadata = { title: "회원가입" };

/** 오픈 리다이렉트 방지 — 내부 경로만 허용 */
function sanitizeNext(raw: string | undefined): string {
  if (!raw) return "/";
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return "/";
  return raw;
}

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const sp = await searchParams;
  return (
    <div className="flex flex-1 items-center justify-center px-5 py-16 md:py-24">
      <SignupForm next={sanitizeNext(sp.next)} />
    </div>
  );
}
