// 랜딩 페이지 — 마케팅 레이아웃(Header + Footer) 사용
// RSC: 모든 섹션이 서버 렌더링 가능

import { HeroSection } from "@/components/marketing/hero-section";
import { FeaturesSection } from "@/components/marketing/features-section";
import { TechStackSection } from "@/components/marketing/tech-stack-section";
import { CtaSection } from "@/components/marketing/cta-section";

export default function HomePage() {
  return (
    <>
      {/* 섹션 순서: 히어로 → 기능 → 기술 스택 → CTA */}
      <HeroSection />
      <FeaturesSection />
      <TechStackSection />
      <CtaSection />
    </>
  );
}
