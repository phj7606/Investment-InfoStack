// 커버리지 섹션 — 플랫폼이 지원하는 시장/지표 범위 배지 나열
// RSC: 정적 데이터 렌더링
// TECH_STACK → COVERAGE_ITEMS로 교체: 투자 도메인 맥락에 맞게 변경

import { Badge } from "@/components/ui/badge";
import { COVERAGE_ITEMS } from "@/lib/constants";

export function TechStackSection() {
  return (
    <section id="tech-stack" className="py-20">
      <div className="container mx-auto px-4 text-center">
        <h2 className="text-3xl font-bold tracking-tight mb-4">분석 커버리지</h2>
        <p className="text-muted-foreground mb-10 max-w-lg mx-auto">
          한국 및 미국 시장의 주요 지수, ETF, 지표를 통합 커버합니다
        </p>
        {/* 배지를 flex-wrap으로 배치 — 화면 너비에 따라 자동 줄바꿈 */}
        <div className="flex flex-wrap gap-3 justify-center max-w-2xl mx-auto">
          {COVERAGE_ITEMS.map((item) => (
            <Badge key={item} variant="outline" className="text-sm py-1 px-3">
              {item}
            </Badge>
          ))}
        </div>
      </div>
    </section>
  );
}
