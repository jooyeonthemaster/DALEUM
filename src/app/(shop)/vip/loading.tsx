/** /vip 로딩 — 다크 무드가 끊기지 않도록 forest-950 유지 */
export default function VipLoading() {
  return (
    <section className="flex flex-1 flex-col items-center justify-center bg-forest-950 px-6 py-28">
      <div className="flex w-full max-w-md flex-col items-center">
        <div className="h-10 w-px animate-pulse bg-brass-500/40" />
        <div className="mt-8 h-3 w-28 animate-pulse bg-cream-50/10" />
        <div className="mt-6 h-8 w-64 animate-pulse bg-cream-50/10" />
        <div className="mt-12 h-12 w-full max-w-xs animate-pulse bg-cream-50/[0.06]" />
      </div>
    </section>
  );
}
