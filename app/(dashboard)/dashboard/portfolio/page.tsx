// 포트폴리오 관리 허브 — ACTION 2 메인 페이지 (Phase 9)
// 계좌별 대시보드 선택 허브:
//   - 추세추종 계좌 (Phase 9 구현 완료)
//   - 중장기 투자 계좌 4802·1635·1402 (Phase 9 구현 완료)
//   - 연금 계좌 (추후 구현 예정)

import Link from "next/link";
import { TrendingUp, Briefcase, PiggyBank, ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// 계좌 목록 정의
const ACCOUNTS = [
  {
    title: "추세추종 계좌",
    description:
      "키움증권 Account 1470 — 추세추종 전략 기반 매수·매도. 승률·손익비·Equity Curve 등 성과 지표 관리.",
    href: "/dashboard/portfolio/trend",
    icon: TrendingUp,
    status: "active" as const,
    badge: "운용 중",
  },
  {
    title: "Value Investment Account",
    description:
      "4802 Stock · 1635 ETF · 1402 Mixed — Excel 임포트로 거래 이력 관리. KR/US 분리 성과 분석, 리밸런싱 제안.",
    href: "/dashboard/portfolio/longterm",
    icon: Briefcase,
    status: "active" as const,
    badge: "운용 중",
  },
  {
    title: "연금 계좌 (IRP)",
    description:
      "삼성증권 개인형 퇴직연금 계좌. ETF 포트폴리오 구성 및 리밸런싱 현황 관리.",
    href: "#",
    icon: PiggyBank,
    status: "soon" as const,
    badge: "준비 중",
  },
];

export const metadata = {
  title: "Investment Management",
  description: "계좌별 포트폴리오 대시보드 — 추세추종·장기투자·연금 계좌 통합 관리",
};

export default function PortfolioHubPage() {
  return (
    <div className="p-6 max-w-4xl mx-auto">
      <PageHeader
        title="Investment Management"
        description="투자 계좌별 대시보드에서 보유 포지션, 리스크 관리, 성과를 관리합니다."
      />

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {ACCOUNTS.map((account) => {
          const Icon = account.icon;
          const isActive = account.status === "active";

          return isActive ? (
            // 활성 계좌: 클릭 가능한 카드
            <Link key={account.title} href={account.href} className="group block">
              <Card className="h-full border-emerald-200 dark:border-emerald-800 hover:border-emerald-400 dark:hover:border-emerald-600 transition-colors hover:shadow-md">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10">
                      <Icon className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <Badge
                      variant="outline"
                      className="text-[10px] border-emerald-400 text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30"
                    >
                      {account.badge}
                    </Badge>
                  </div>
                  <CardTitle className="text-base mt-2 group-hover:text-emerald-600 transition-colors">
                    {account.title}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-xs leading-relaxed">
                    {account.description}
                  </CardDescription>
                  <div className="flex items-center gap-1 mt-3 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                    대시보드 열기
                    <ArrowRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          ) : (
            // 미구현 계좌: 클릭 불가 카드 (점선 테두리)
            <Card
              key={account.title}
              className={cn("h-full border-dashed opacity-60 cursor-not-allowed")}
            >
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
                    <Icon className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <Badge variant="secondary" className="text-[10px]">
                    {account.badge}
                  </Badge>
                </div>
                <CardTitle className="text-base mt-2 text-muted-foreground">
                  {account.title}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-xs leading-relaxed">
                  {account.description}
                </CardDescription>
                <p className="mt-3 text-[10px] text-muted-foreground/60 font-medium">
                  추후 구현 예정
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
