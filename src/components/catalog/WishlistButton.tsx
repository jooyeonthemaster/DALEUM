"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Heart } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export interface WishlistButtonProps {
  productId: string;
  initialWished: boolean;
  isLoggedIn: boolean;
  /** 비로그인 시 로그인 후 돌아올 경로 */
  next?: string;
  className?: string;
}

/** 위시리스트 토글 — 로그인 시 wishlists insert/delete, 비로그인은 로그인 페이지로 유도 */
export default function WishlistButton({
  productId,
  initialWished,
  isLoggedIn,
  next,
  className = "",
}: WishlistButtonProps) {
  const router = useRouter();
  const [wished, setWished] = useState(initialWished);
  const [pending, setPending] = useState(false);

  async function toggle() {
    if (!isLoggedIn) {
      router.push(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
      return;
    }
    if (pending) return;
    setPending(true);

    const nextWished = !wished;
    setWished(nextWished); // 낙관적 갱신

    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("no session");

      if (nextWished) {
        const { error } = await supabase
          .from("wishlists")
          .insert({ user_id: user.id, product_id: productId });
        // 23505 = 이미 담겨 있음 (unique) — 성공으로 간주
        if (error && error.code !== "23505") throw error;
      } else {
        const { error } = await supabase
          .from("wishlists")
          .delete()
          .eq("user_id", user.id)
          .eq("product_id", productId);
        if (error) throw error;
      }
    } catch {
      setWished(!nextWished); // 롤백
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={wished}
      aria-label={wished ? "위시리스트에서 빼기" : "위시리스트에 담기"}
      title={wished ? "위시리스트에서 빼기" : "위시리스트에 담기"}
      className={`flex h-12 w-12 shrink-0 items-center justify-center border transition-colors duration-300 ${
        wished
          ? "border-forest-700 text-forest-700"
          : "border-ink-200 text-ink-500 hover:border-ink-400 hover:text-ink-800"
      } ${className}`}
    >
      <Heart
        size={19}
        strokeWidth={1.5}
        fill={wished ? "currentColor" : "none"}
      />
    </button>
  );
}
