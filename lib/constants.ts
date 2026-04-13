// 애플리케이션 전체에서 사용하는 상수 정의
// 단일 진실 원천(Single Source of Truth)으로 관리
// 사이트명, 내비게이션, 기능 목록 등은 이 파일만 수정하면 전체 반영

import type { SiteConfig, NavItem, Feature } from "@/types";

// 사이트 기본 메타데이터 설정
export const SITE_CONFIG: SiteConfig = {
  name: "Investment InfoStack",
  description: "나만의 투자 분석 플랫폼 — 거시환경부터 개별 종목까지 통합 분석",
  url: "https://investment-infostack.example.com",
  ogImage: "https://investment-infostack.example.com/og.png",
  links: {
    github: "https://github.com",
  },
};

// 마케팅/헤더 내비게이션 링크
export const NAV_ITEMS: NavItem[] = [
  { title: "플랫폼 소개", href: "/#features" },
  { title: "대시보드", href: "/dashboard" },
];

// 푸터 내비게이션 링크 — 경로 변경 시 이 파일만 수정하면 됨
export const FOOTER_NAV_ITEMS: NavItem[] = [
  { title: "홈", href: "/" },
  { title: "대시보드", href: "/dashboard" },
  { title: "로그인", href: "/login" },
];

// 랜딩 페이지 기능 소개 섹션 데이터
// 플랫폼의 3대 모듈(M1~M3)을 상세 기능 단위로 분해하여 소개
export const FEATURES: Feature[] = [
  {
    title: "Fear & Greed Oscillator",
    description:
      "KOSPI/KOSDAQ, S&P500/NASDAQ 기준 시장 심리 지수를 실시간으로 추적합니다. 극단적 공포/탐욕 구간에서 역추세 매매 타이밍을 포착합니다.",
  },
  {
    title: "SuperMA + Elder Impulse",
    description:
      "장기 추세선(SuperMA) 및 Elder Impulse 신호로 시장 방향성을 판단합니다. Gap% 차트로 추세 강도를 수치화하여 제공합니다.",
  },
  {
    title: "업종 쏠림지수",
    description:
      "특정 섹터로의 자금 쏠림 현상을 감지합니다. 쏠림이 극단에 달할 때 반전 신호로 활용하여 섹터 로테이션 전략을 지원합니다.",
  },
  {
    title: "Mansfield RS 스크리너",
    description:
      "미국 ETF, 한국 ETF, 글로벌 ETF를 Mansfield 상대강도 지표로 랭킹합니다. 변동성 조정 모멘텀과 Sortino Rank를 통합 제공합니다.",
  },
  {
    title: "ETR Comfort Rank",
    description:
      "ETF 트렌드 강도와 편안함 점수를 결합한 복합 지표입니다. 강한 추세를 유지하면서도 변동성이 낮은 안정적인 ETF를 우선적으로 선별합니다.",
  },
  {
    title: "포트폴리오 관리",
    description:
      "보유 종목 현황, 교체 신호, IRP 포트폴리오를 통합 관리합니다. 상대강도 약화 종목의 교체 시점을 자동으로 감지합니다.",
  },
];

// 투자 분석 플랫폼 커버리지 배지 목록
// 마케팅 페이지 기술 스택 섹션에서 재활용
export const COVERAGE_ITEMS = [
  "KOSPI / KOSDAQ",
  "S&P 500 / NASDAQ",
  "한국 ETF ~40종",
  "해외상장 ETF ~38종",
  "SPDR 섹터 ETF",
  "Fear & Greed",
  "Mansfield RS",
  "Elder Impulse",
  "SuperMA",
  "Sortino Rank",
  "ETR Comfort",
  "IRP 포트폴리오",
];
