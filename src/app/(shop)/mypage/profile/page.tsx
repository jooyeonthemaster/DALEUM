import type { Metadata } from "next";
import ProfileClient from "@/components/mypage/ProfileClient";

export const metadata: Metadata = { title: "회원 정보" };

export default function ProfilePage() {
  return <ProfileClient />;
}
