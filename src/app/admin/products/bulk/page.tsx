import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import BulkProductImportClient from "./BulkProductImportClient";
import type { Category } from "@/lib/types";

export const metadata: Metadata = { title: "상품 일괄 등록" };

export default async function AdminProductsBulkPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?next=/admin/products/bulk");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.role !== "admin") redirect("/");

  const service = createServiceClient();
  const { data } = await service
    .from("categories")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  return <BulkProductImportClient categories={(data ?? []) as Category[]} />;
}
