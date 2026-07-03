"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { ProductWithImages } from "@/lib/types";
import { useCart } from "@/store/cart";
import PriceTag from "@/components/shop/PriceTag";
import EmptyState from "@/components/shop/EmptyState";
import { ProductCardSkeleton } from "@/components/shop/Skeleton";

interface WishJoinRow {
  id: string;
  products: ProductWithImages | ProductWithImages[] | null;
}

interface WishEntry {
  wishId: string;
  product: ProductWithImages | null;
}

/** 위시리스트 그리드 — 제거 + 장바구니 담기 */
export default function WishlistGrid() {
  const supabase = useMemo(() => createClient(), []);
  const addToCart = useCart((s) => s.add);
  const [entries, setEntries] = useState<WishEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [addedId, setAddedId] = useState<string | null>(null);
  const addedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(() => {
    supabase
      .from("wishlists")
      .select(
        "id, products(*, product_images(*), product_variants(*), categories(id, slug, name))"
      )
      .order("created_at", { ascending: false })
      .then(({ data, error: loadError }) => {
        if (loadError) {
          setError("위시리스트를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
          setEntries([]);
          return;
        }
        setEntries(
          ((data ?? []) as unknown as WishJoinRow[]).map((row) => ({
            wishId: row.id,
            product: Array.isArray(row.products) ? (row.products[0] ?? null) : row.products,
          }))
        );
      });
  }, [supabase]);

  useEffect(() => {
    load();
    return () => {
      if (addedTimer.current) clearTimeout(addedTimer.current);
    };
  }, [load]);

  const remove = async (wishId: string) => {
    setError(null);
    const prev = entries;
    setEntries((cur) => (cur ?? []).filter((e) => e.wishId !== wishId)); // 낙관적 제거
    const { error: deleteError } = await supabase.from("wishlists").delete().eq("id", wishId);
    if (deleteError) {
      setEntries(prev);
      setError("삭제에 실패했습니다. 잠시 후 다시 시도해 주세요.");
    }
  };

  const primaryImage = (product: ProductWithImages) => {
    const images = [...(product.product_images ?? [])].sort(
      (a, b) => a.sort_order - b.sort_order
    );
    return images.find((img) => img.is_primary) ?? images[0] ?? null;
  };

  const handleAdd = (product: ProductWithImages) => {
    const image = primaryImage(product);
    addToCart({
      productId: product.id,
      variantId: null,
      slug: product.slug,
      name: product.name,
      optionName: null,
      price: product.price,
      originalPrice: product.compare_at_price ?? product.price,
      imageUrl: image?.url ?? null,
      stock: product.stock,
    });
    setAddedId(product.id);
    if (addedTimer.current) clearTimeout(addedTimer.current);
    addedTimer.current = setTimeout(() => setAddedId(null), 2000);
  };

  if (entries === null) {
    return (
      <div>
        <h2 className="headline-serif mb-6 text-xl text-ink-900 md:text-[1.35rem]">
          위시리스트
        </h2>
        <div className="grid grid-cols-2 gap-x-3 gap-y-10 md:grid-cols-3 md:gap-x-4 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <ProductCardSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-baseline justify-between gap-3">
        <h2 className="headline-serif text-xl text-ink-900 md:text-[1.35rem]">위시리스트</h2>
        {entries.length > 0 && (
          <span className="krw text-xs text-ink-400">{entries.length}개</span>
        )}
      </div>

      {error && (
        <p role="alert" className="mb-4 text-[13px] text-signal-red">
          {error}
        </p>
      )}

      {entries.length === 0 ? (
        <EmptyState
          title="마음에 담아둔 상품이 아직 없습니다."
          description="상품 상세에서 하트를 누르면 이곳에 차곡차곡 모입니다."
          action={{ href: "/products", label: "상품 둘러보기" }}
        />
      ) : (
        <ul className="grid grid-cols-2 gap-x-3 gap-y-10 md:grid-cols-3 md:gap-x-4 xl:grid-cols-4">
          {entries.map(({ wishId, product }) => {
            if (!product) {
              // 판매 종료/숨김 처리된 상품
              return (
                <li key={wishId} className="relative">
                  <div className="flex aspect-[4/5] items-center justify-center bg-cream-100">
                    <span className="label-caps text-ink-300">Daleum</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => remove(wishId)}
                    aria-label="위시리스트에서 삭제"
                    className="absolute right-2 top-2 bg-cream-50/90 p-1.5 text-ink-500 transition-colors hover:text-ink-900"
                  >
                    <X size={16} strokeWidth={1.5} />
                  </button>
                  <p className="pt-4 text-sm text-ink-400">판매가 종료된 상품입니다.</p>
                </li>
              );
            }

            const image = primaryImage(product);
            const soldOut = product.status === "sold_out" || product.stock <= 0;
            const hasVariants = (product.product_variants ?? []).some((v) => v.is_active);
            const added = addedId === product.id;

            return (
              <li key={wishId} className="group relative flex flex-col">
                <Link
                  href={`/products/${product.slug}`}
                  className="showcase-img relative block aspect-[4/5] overflow-hidden rounded-sm bg-cream-100"
                >
                  {image ? (
                    <Image
                      src={image.url}
                      alt={image.alt ?? product.name}
                      fill
                      sizes="(min-width: 1280px) 25vw, (min-width: 768px) 33vw, 50vw"
                      className="object-cover"
                    />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center">
                      <span className="label-caps text-ink-300">Daleum</span>
                    </span>
                  )}
                  {soldOut && (
                    <span className="absolute inset-0 flex items-center justify-center bg-cream-50/70">
                      <span className="label-caps border border-ink-900 px-4 py-2 text-ink-900">
                        일시품절
                      </span>
                    </span>
                  )}
                </Link>
                <button
                  type="button"
                  onClick={() => remove(wishId)}
                  aria-label={`${product.name} 위시리스트에서 삭제`}
                  className="absolute right-2 top-2 bg-cream-50/90 p-1.5 text-ink-500 transition-colors hover:text-ink-900"
                >
                  <X size={16} strokeWidth={1.5} />
                </button>

                <div className="flex flex-1 flex-col pt-4">
                  <Link href={`/products/${product.slug}`}>
                    <h3 className="text-[15px] font-medium leading-snug text-ink-900">
                      {product.name}
                    </h3>
                  </Link>
                  {product.subtitle && (
                    <p className="mt-1 line-clamp-1 text-[13px] text-ink-500">
                      {product.subtitle}
                    </p>
                  )}
                  <PriceTag
                    price={product.price}
                    compareAt={product.compare_at_price}
                    size="sm"
                    className="mt-2.5"
                  />

                  <div className="mt-auto pt-3.5">
                    {soldOut ? (
                      <button
                        type="button"
                        disabled
                        className="w-full border border-ink-200 py-2.5 text-[13px] text-ink-400"
                      >
                        일시품절
                      </button>
                    ) : hasVariants ? (
                      <Link
                        href={`/products/${product.slug}`}
                        className="block w-full border border-ink-900 py-2.5 text-center text-[13px] text-ink-900 transition-colors hover:bg-ink-900 hover:text-cream-50"
                      >
                        옵션 선택하기
                      </Link>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleAdd(product)}
                        className={`w-full border py-2.5 text-[13px] transition-colors ${
                          added
                            ? "border-forest-700 bg-forest-700 text-cream-50"
                            : "border-ink-900 text-ink-900 hover:bg-ink-900 hover:text-cream-50"
                        }`}
                      >
                        {added ? "장바구니에 담았습니다" : "장바구니 담기"}
                      </button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
