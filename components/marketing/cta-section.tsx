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
          지금 바로 시작하세요
        </h2>
        <p className="text-primary-foreground/80 mb-10 max-w-lg mx-auto">
          이미 구성된 컴포넌트와 레이아웃으로 개발 시간을 단축하고
          핵심 비즈니스 로직에 집중하세요.
        </p>
        {/* 주요 CTA: 대시보드 탐색 | 보조 CTA: 회원가입 */}
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
            <Link href="/register">무료로 시작하기</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
