// CTA(Call to Action) 섹션 — 랜딩 페이지 하단, 최종 전환 유도
// RSC: 정적 컴포넌트

import Link from "next/link";
import { Button } from "@/components/ui/button";

export function CtaSection() {
  return (
    // 대비되는 배경색으로 섹션 분리 및 시선 집중
    <section className="py-20 bg-primary text-primary-foreground">
      <div className="container mx-auto px-4 text-center">
        <h2 className="text-3xl font-bold tracking-tight mb-4">
          체계적인 투자를 시작하세요
        </h2>
        <p className="text-primary-foreground/80 mb-10 max-w-lg mx-auto">
          시장 심리 지수, 상대강도 스크리너, 포트폴리오 관리를 한 곳에서.
          탑다운 투자 프로세스를 디지털화하여 의사결정 품질을 높이세요.
        </p>
        {/* 주요 CTA: 대시보드 탐색 | 보조 CTA: 시작하기 */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Button size="lg" variant="secondary" asChild>
            <Link href="/dashboard">대시보드 탐색</Link>
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="border-primary-foreground/50 text-primary-foreground hover:bg-primary-foreground/10"
            asChild
          >
            <Link href="/login">시작하기</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
