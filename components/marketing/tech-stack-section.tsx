// 기술 스택 섹션 — 사용된 라이브러리 배지 나열
// RSC: 정적 데이터 렌더링

import { Badge } from "@/components/ui/badge";
import { TECH_STACK } from "@/lib/constants";

export function TechStackSection() {
  return (
    <section id="tech-stack" className="py-20">
      <div className="container mx-auto px-4 text-center">
        <h2 className="text-3xl font-bold tracking-tight mb-4">기술 스택</h2>
        <p className="text-muted-foreground mb-10 max-w-lg mx-auto">
          검증된 오픈소스 라이브러리로 구성된 현대적 기술 스택
        </p>
        {/* 배지를 flex-wrap으로 배치 — 화면 너비에 따라 자동 줄바꿈 */}
        <div className="flex flex-wrap gap-3 justify-center max-w-2xl mx-auto">
          {TECH_STACK.map((tech) => (
            <Badge key={tech} variant="outline" className="text-sm py-1 px-3">
              {tech}
            </Badge>
          ))}
        </div>
      </div>
    </section>
  );
}
