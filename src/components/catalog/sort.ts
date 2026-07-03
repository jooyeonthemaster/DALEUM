export type SortKey = "latest" | "price_asc" | "price_desc" | "popular";

export const SORT_LABELS: Record<SortKey, string> = {
  latest: "최신순",
  popular: "인기순",
  price_asc: "낮은 가격순",
  price_desc: "높은 가격순",
};

export const SORT_ORDER: SortKey[] = ["latest", "popular", "price_asc", "price_desc"];

export function parseSortKey(value: unknown): SortKey {
  return typeof value === "string" && SORT_ORDER.includes(value as SortKey)
    ? (value as SortKey)
    : "latest";
}
