import type { NextConfig } from "next";
import { IMAGE_SOURCE_PATTERNS } from "@/lib/image-sources";

const nextConfig: NextConfig = {
  images: {
    /**
     * 허용 출처 목록은 src/lib/image-sources.ts 한 곳에만 산다.
     * 상세페이지 편집기가 붙여넣기로 들어오는 img 를 걸러낼 때 **같은 목록**을 읽어야 하기
     * 때문이다 — 목록이 갈라지면 편집기가 통과시킨 주소를 next/image 가 거부해
     * 고객 상품 페이지가 렌더 중 throw 한다.
     */
    remotePatterns: IMAGE_SOURCE_PATTERNS,
    // Next 16 부터 필수 항목 — 명시하지 않으면 기본값 [75] 가 적용된다.
    // 코드에서 quality 를 따로 주지 않으므로 기본값 그대로 고정한다.
    qualities: [75],
    /**
     * 최적화 이미지 보관 기간(초). 기본값 4시간(14400)에서는 상품 이미지 요청이 계속
     * MISS/STALE 로 떨어지며 Vercel 이 원본을 다시 받아 재인코딩한다(실측 확인).
     *
     * 다만 길게 잡을수록 위험도 같이 커진다 — 이미지 옵티마이저 캐시에는 무효화 수단이
     * 없고(next 문서 image.md), revalidateTag 는 Data Cache 만 건드릴 뿐 /_next/image 에는
     * 닿지 않는다. 게다가 시드 스크립트(scripts/seed.mjs, sudarak_launch.mjs,
     * fix_tall_gallery_images.mjs)가 결정적 경로에 upsert 로 덮어쓰므로, 이 값이 곧
     * "이미지를 교체했을 때 반영까지 걸리는 최대 시간"이 된다.
     * 그래서 재인코딩 억제 효과는 얻되 최악의 회복 시간은 하루로 묶는다.
     * 즉시 반영이 필요하면 관리자 업로드(고유 경로)를 쓰거나 url 에 ?v=<updated_at> 을 붙인다.
     */
    minimumCacheTTL: 86400, // 1일
  },
};

export default nextConfig;
