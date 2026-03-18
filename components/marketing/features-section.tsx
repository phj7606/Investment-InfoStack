// 기능 소개 섹션 — 6개 카드 그리드로 핵심 기능 나열
// RSC: FEATURES 상수에서 데이터 가져와 정적 렌더링

import {
  Layers,
  Palette,
  ShieldCheck,
  Smartphone,
  FileCode2,
  Blocks,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FEATURES } from "@/lib/constants";

// 각 기능에 시각적으로 의미 있는 아이콘 매핑
const featureIcons = [Layers, Palette, ShieldCheck, Smartphone, FileCode2, Blocks];

export function FeaturesSection() {
  return (
    <section id="features" className="py-20 bg-muted/30">
      <div className="container mx-auto px-4">
        {/* 섹션 헤더 */}
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold tracking-tight mb-4">
            모든 것이 준비되어 있습니다
          </h2>
          <p className="text-muted-foreground max-w-xl mx-auto">
            반복적으로 구현하던 공통 기능들을 한 번에 제공합니다.
          </p>
        </div>

        {/* 반응형 그리드: 모바일 1열 → 태블릿 2열 → 데스크탑 3열 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {FEATURES.map((feature, index) => {
            const Icon = featureIcons[index % featureIcons.length];
            return (
              <Card key={feature.title} className="hover:shadow-md transition-shadow">
                <CardHeader>
                  {/* 아이콘: 기능의 성격을 직관적으로 전달 */}
                  <div className="rounded-lg bg-primary/10 w-10 h-10 flex items-center justify-center mb-2">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <CardTitle className="text-lg">{feature.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    {feature.description}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
}
