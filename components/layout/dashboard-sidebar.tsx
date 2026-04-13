"use client";

// 대시보드 사이드바 — shadcn Sidebar 컴포넌트 기반
// 투자 분석 플랫폼 7개 모듈 메뉴 및 현재 경로 강조 포함

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  TrendingUp,
  Globe,
  BarChart2,
  ScanSearch,
  Briefcase,
  Building2,
  Settings,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { UserMenu } from "@/components/common/user-menu";
import { SITE_CONFIG } from "@/lib/constants";

// 투자 분석 플랫폼 7개 메뉴 정의
// 아이콘은 각 모듈의 성격을 직관적으로 표현
const NAV_ITEMS = [
  {
    title: "시장 분석",
    href: "/dashboard",
    // LayoutDashboard: 전체 개요 페이지임을 명시
    icon: LayoutDashboard,
  },
  {
    title: "한국 시장",
    href: "/dashboard/kr-market",
    // TrendingUp: KOSPI/KOSDAQ 추세 분석 모듈
    icon: TrendingUp,
  },
  {
    title: "미국 시장",
    href: "/dashboard/us-market",
    // Globe: 해외(미국) 시장을 나타내는 글로벌 아이콘
    icon: Globe,
  },
  {
    title: "상대강도",
    href: "/dashboard/relative-strength",
    // BarChart2: Mansfield RS 등 강도 지표 비교 차트
    icon: BarChart2,
  },
  {
    title: "종목 스크리너",
    href: "/dashboard/screener",
    // ScanSearch: 조건 검색/필터링 의미
    icon: ScanSearch,
  },
  {
    title: "포트폴리오",
    href: "/dashboard/portfolio",
    // Briefcase: 보유 종목 관리 의미
    icon: Briefcase,
  },
  {
    title: "기업 분석",
    href: "/dashboard/company-analysis",
    // Building2: 개별 기업 심층 분석 모듈
    icon: Building2,
  },
  {
    title: "설정",
    href: "/dashboard/settings",
    icon: Settings,
  },
];

export function DashboardSidebar() {
  const pathname = usePathname();

  return (
    <Sidebar>
      {/* 사이드바 상단: 플랫폼 브랜드명 */}
      <SidebarHeader className="border-b px-4 py-3">
        <Link href="/" className="font-bold text-lg">
          {SITE_CONFIG.name}
        </Link>
      </SidebarHeader>

      {/* 사이드바 본문: 7개 투자 분석 모듈 내비게이션 */}
      <SidebarContent className="px-2 py-4">
        <SidebarMenu>
          {NAV_ITEMS.map((item) => {
            // 대시보드 루트("/dashboard")는 정확히 일치할 때만 활성화
            // 서브 페이지들은 startsWith로 상위 경로 포함 활성화
            const isActive =
              item.href === "/dashboard"
                ? pathname === "/dashboard"
                : pathname.startsWith(item.href);
            const Icon = item.icon;

            return (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton asChild isActive={isActive}>
                  <Link href={item.href}>
                    <Icon className="h-4 w-4" />
                    <span>{item.title}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarContent>

      {/* 사이드바 하단: 사용자 메뉴 */}
      <SidebarFooter className="border-t p-3">
        <UserMenu />
      </SidebarFooter>
    </Sidebar>
  );
}
