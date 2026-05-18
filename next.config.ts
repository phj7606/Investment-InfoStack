import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 기존 라우트 → 새 라우트 임시 redirect (Phase 7)
  // permanent: false(307) — Phase 8에서 기존 페이지 콘텐츠가 완전히 이전된 후 301로 전환 예정
  async redirects() {
    return [
      // 한국/미국 시장 → 섹터 조감 (Step 1)
      {
        source: "/dashboard/kr-market",
        destination: "/dashboard/sector",
        permanent: false,
      },
      {
        source: "/dashboard/us-market",
        destination: "/dashboard/sector",
        permanent: false,
      },
      // 스크리너 + 상대강도 → 종목 압축 (Step 2)
      {
        source: "/dashboard/screener",
        destination: "/dashboard/screen",
        permanent: false,
      },
      {
        source: "/dashboard/relative-strength",
        destination: "/dashboard/screen",
        permanent: false,
      },
      // 기업 분석 → 매수 결정 (Step 5)
      {
        source: "/dashboard/company-analysis",
        destination: "/dashboard/initiating-coverage",
        permanent: false,
      },
      // 구 ACTION 2 (추적 관찰) 페이지 → 포트폴리오 관리 허브로 redirect (Phase 9)
      {
        source: "/dashboard/thesis",
        destination: "/dashboard/portfolio",
        permanent: false,
      },
      {
        source: "/dashboard/catalysts",
        destination: "/dashboard/portfolio",
        permanent: false,
      },
      {
        source: "/dashboard/earnings",
        destination: "/dashboard/portfolio",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
