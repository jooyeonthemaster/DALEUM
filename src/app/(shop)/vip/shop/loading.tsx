/** /vip/shop 로딩 — 다크 살롱 톤의 그리드 스켈레톤 */
export default function VipShopLoading() {
  return (
    <div className="flex-1 bg-forest-950">
      <section className="container-hall pb-12 pt-16 md:pb-16 md:pt-24">
        <div className="h-3 w-32 animate-pulse bg-cream-50/10" />
        <div className="mt-6 h-9 w-72 max-w-full animate-pulse bg-cream-50/10 md:h-12 md:w-[26rem]" />
        <div className="mt-6 h-4 w-80 max-w-full animate-pulse bg-cream-50/[0.06]" />
      </section>
      <section className="container-hall border-t border-cream-50/10 pb-24 pt-12 md:pb-32 md:pt-16">
        <div className="grid grid-cols-2 gap-x-3 gap-y-12 md:grid-cols-3 md:gap-x-4 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i}>
              <div className="aspect-[4/5] animate-pulse rounded-sm bg-cream-50/[0.06]" />
              <div className="mt-4 h-4 w-3/4 animate-pulse bg-cream-50/[0.06]" />
              <div className="mt-2.5 h-4 w-1/2 animate-pulse bg-cream-50/[0.06]" />
              <div className="mt-4 h-10 w-full animate-pulse bg-cream-50/[0.04]" />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
