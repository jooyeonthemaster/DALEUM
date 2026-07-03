/** /vip/s/[token] 로딩 — 초대장이 열리기 전의 조용한 다크 화면 */
export default function CampaignLoading() {
  return (
    <section className="flex flex-1 flex-col items-center justify-center bg-forest-950 px-6 py-32">
      <div className="flex w-full max-w-xl flex-col items-center">
        <div className="h-10 w-px animate-pulse bg-brass-500/40" />
        <div className="mt-8 h-3 w-36 animate-pulse bg-cream-50/10" />
        <div className="mt-7 h-9 w-72 max-w-full animate-pulse bg-cream-50/10" />
        <div className="mt-10 h-4 w-full max-w-md animate-pulse bg-cream-50/[0.06]" />
        <div className="mt-3 h-4 w-4/5 max-w-sm animate-pulse bg-cream-50/[0.06]" />
      </div>
    </section>
  );
}
