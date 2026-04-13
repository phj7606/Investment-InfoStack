// 기능 소개 섹션 — 플랫폼 3대 모듈(M1~M3) 카드 그리드
// RSC: FEATURES 상수에서 데이터 가져와 정적 렌더링

import {
  Activity,
  BarChart2,
  Briefcase,
  TrendingUp,
  ScanSearch,
  Globe,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FEATURES } from "@/lib/constants";

// 각 기능에 시각적으로 의미 있는 아이콘 매핑
// FEATURES 배열 순서와 1:1 대응: Fear&Greed → SuperMA → 쏠림지수 → MansFieldRS → ETR → 포트폴리오
const featureIcons = [Activity, TrendingUp, Globe, BarChart2, ScanSearch, Briefcase];

export function FeaturesSection() {
  return (
    <section id="features" className="py-20 bg-muted/30">
      <div className="container mx-auto px-4">
        {/* 섹션 헤더 */}
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold tracking-tight mb-4">
            투자 의사결정에 필요한 모든 분석
          </h2>
          <p className="text-muted-foreground max-w-xl mx-auto">
            거시환경 분석 → 섹터 강도 → 개별 종목 선별까지,
            체계적인 탑다운 투자 프로세스를 지원합니다.
          </p>
        </div>

        {/* 반응형 그리드: 모바일 1열 → 태블릿 2열 → 데스크탑 3열 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {FEATURES.map((feature, index) => {
            const Icon = featureIcons[index % featureIcons.length];
            return (
              <Card key={feature.title} className="hover:shadow-md transition-shadow">
                <CardHeader>
                  {/* 아이콘: 각 분석 모듈의 성격을 직관적으로 전달 */}
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
