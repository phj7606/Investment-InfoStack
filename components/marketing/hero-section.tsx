// 히어로 섹션 — 투자 분석 플랫폼의 첫 인상, 핵심 가치 전달
// RSC: 정적 콘텐츠, animate-fade-in-up으로 등장 효과

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function HeroSection() {
  return (
    // 그라디언트 배경 + 수직 중앙 정렬
    <section className="relative overflow-hidden bg-gradient-to-br from-background via-background to-muted py-20 md:py-32">
      {/* 배경 장식: 미묘한 그라디언트 원으로 깊이감 추가 */}
      <div
        className="absolute inset-0 -z-10 opacity-30"
        aria-hidden="true"
      >
        <div className="absolute top-0 left-1/4 h-96 w-96 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute bottom-0 right-1/4 h-96 w-96 rounded-full bg-primary/5 blur-3xl" />
      </div>

      {/* animate-fade-in-up: globals.css에 정의된 등장 애니메이션 */}
      <div className="container mx-auto px-4 text-center animate-fade-in-up">
        {/* 플랫폼 성격을 간결하게 요약한 배지 */}
        <Badge variant="secondary" className="mb-6">
          나만의 투자 분석 시스템
        </Badge>

        <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl md:text-6xl mb-6">
          거시환경부터 종목까지{" "}
          {/* 강조 텍스트: 그라디언트로 시각적 임팩트 */}
          <span className="bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
            통합 투자 분석
          </span>
        </h1>

        <p className="max-w-2xl mx-auto text-lg text-muted-foreground mb-10">
          Fear &amp; Greed Oscillator로 시장 심리를 파악하고,
          Mansfield RS로 강한 섹터를 선별하며,
          포트폴리오 교체 신호까지 한 곳에서 관리하는 개인 투자 분석 플랫폼입니다.
        </p>

        {/* CTA 버튼 2개: 주요 행동(대시보드)과 보조 행동(시작) */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Button size="lg" asChild>
            <Link href="/dashboard">대시보드 보기</Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <Link href="/login">시작하기</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
