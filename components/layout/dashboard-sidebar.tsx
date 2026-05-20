"use client";

// 대시보드 사이드바 — Investment+ 3개 Action 워크플로우 기반 재편 (Phase 7 — UI 리디자인)
// 4개 SidebarGroup: 홈 / ACTION 1(종목 탐색) / ACTION 2(추적 관찰) / ACTION 3(자동화 루틴) / 설정
// 각 Action별 컬러 테마: ACTION 1=인디고, ACTION 2=에메랄드, ACTION 3=앰버

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Search,
  Briefcase,
  TrendingUp,
  Zap,
  Settings,
  Map,
  ScanSearch,
  Radar,
  Star,
  Newspaper,
  ClipboardList,
  FileBarChart,
  Bot,
  Globe,
  BarChart3,
  PiggyBank,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { UserMenu } from "@/components/common/user-menu";
import { SITE_CONFIG } from "@/lib/constants";
import { cn } from "@/lib/utils";

// ACTION 1 · 종목 탐색 선행 독립 메뉴 — 시장 환경 (스텝 번호 없음)
// 섹터 조감 전에 거시 환경을 파악하는 단계
const MARKET_ENV_ITEM = {
  title: "시장 환경",
  href: "/dashboard/market",
  icon: Globe,
};

// ACTION 1 · 종목 탐색 — 4단계 퍼널 (Step 1~4)
// Phase 8: 종목 압축(2) + 실적 채점(3) → 종목 분석(2)으로 통합, step 번호 재정렬
const ACTION1_ITEMS = [
  {
    step: 1,
    title: "섹터 조감",
    href: "/dashboard/sector",
    icon: Map,
  },
  {
    step: 2,
    title: "종목 분석",
    href: "/dashboard/screen",
    icon: ScanSearch,
  },
  {
    step: 3,
    title: "체크포인트",
    href: "/dashboard/earnings-preview",
    icon: Radar,
  },
  {
    step: 4,
    title: "매수 결정",
    href: "/dashboard/initiating-coverage",
    icon: Star,
  },
];

// ACTION 2 · 포트폴리오 관리 — 계좌별 대시보드 + 성과 분석
// Phase 9: Short-term / Education / Value Investment 계좌 구현
// Phase 10: 성과 분석 페이지 추가
const ACTION2_ITEMS = [
  {
    title: "Short-term Account",
    href: "/dashboard/portfolio/trend",
    icon: TrendingUp,
  },
  {
    title: "Education Account",
    href: "/dashboard/portfolio/education",
    icon: Zap,
  },
  {
    title: "Pension Account",
    href: "/dashboard/portfolio/pension",
    icon: PiggyBank,
  },
  {
    title: "Value Investment Account",
    href: "/dashboard/portfolio/longterm",
    icon: Briefcase,
  },
  {
    title: "Performance Analysis",
    href: "/dashboard/portfolio/performance",
    icon: BarChart3,
  },
];

// ACTION 3 · 자동화 루틴 — Morning Note + 주간/월간 리뷰 + 자동화 설정
const ACTION3_ITEMS = [
  {
    title: "Morning Note",
    href: "/dashboard/morning-note",
    icon: Newspaper,
  },
  {
    title: "주간 리뷰",
    href: "/dashboard/weekly-review",
    icon: ClipboardList,
  },
  {
    title: "월간 보고서",
    href: "/dashboard/monthly-report",
    icon: FileBarChart,
  },
  {
    title: "자동화 설정",
    href: "/dashboard/automation",
    icon: Bot,
  },
];

export function DashboardSidebar() {
  const pathname = usePathname();

  // 현재 경로가 해당 메뉴 항목과 일치하는지 판단
  // 홈("/dashboard")은 정확 일치, 나머지는 startsWith로 서브 경로 포함
  const isActive = (href: string) =>
    href === "/dashboard"
      ? pathname === "/dashboard"
      : pathname.startsWith(href);

  return (
    <Sidebar>
      {/* ── 사이드바 상단: 브랜드 영역 ── */}
      <SidebarHeader className="h-[56px] border-b px-4 bg-gradient-to-b from-slate-50 to-white dark:from-slate-900 dark:to-sidebar">
        <Link href="/" className="flex items-center gap-2.5 group">
          {/* 브랜드 로고 심볼 — 인디고 강조 */}
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-600 to-blue-600 shadow-sm">
            <span className="text-[11px] font-black text-white leading-none">I+</span>
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-sm tracking-tight leading-none">
              {SITE_CONFIG.name}
            </span>
            {/* 버전/상태 뱃지 */}
            <span className="text-[9px] font-medium text-muted-foreground tracking-wide mt-0.5">
              1인 투자 하우스
            </span>
          </div>
        </Link>
      </SidebarHeader>

      <SidebarContent className="px-2 py-2">
        {/* ── 홈 그룹 ── */}
        <SidebarGroup>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={isActive("/dashboard")}>
                <Link href="/dashboard">
                  <LayoutDashboard className="h-4 w-4" />
                  <span>홈</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>

        {/* ── ACTION 1 · 종목 탐색 그룹 — 인디고 테마 ── */}
        <SidebarGroup>
          <SidebarGroupLabel className="flex items-center gap-1.5 mb-1">
            {/* ACTION 번호를 컬러 배지로 강조 — 인디고 */}
            <span className="inline-flex items-center gap-1 rounded-md bg-indigo-500/10 px-1.5 py-0.5 text-[10px] font-bold text-indigo-600 dark:text-indigo-400 ring-1 ring-inset ring-indigo-500/20">
              <Search className="h-2.5 w-2.5" />
              ACTION 1
            </span>
            <span className="text-[10px] font-semibold text-muted-foreground tracking-wide">종목 탐색</span>
          </SidebarGroupLabel>
          <SidebarMenu>
            {/* ── 시장 환경 — 스텝 번호 없는 독립 선행 메뉴 ── */}
            {(() => {
              const active = isActive(MARKET_ENV_ITEM.href);
              const Icon = MARKET_ENV_ITEM.icon;
              return (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={active}>
                    <Link
                      href={MARKET_ENV_ITEM.href}
                      className={cn(
                        // 활성 메뉴: 인디고 왼쪽 보더 강조
                        active && "border-l-2 border-indigo-500 !text-indigo-600 dark:!text-indigo-400 !bg-indigo-500/8"
                      )}
                    >
                      <span className="flex items-center gap-1.5 flex-1">
                        {/* 스텝 번호 대신 Globe 아이콘 배지 */}
                        <span className={cn(
                          "inline-flex items-center justify-center w-4 h-4 rounded-full shrink-0 transition-colors",
                          active
                            ? "bg-indigo-500 text-white"
                            : "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400"
                        )}>
                          <Globe className="w-2.5 h-2.5" />
                        </span>
                        {MARKET_ENV_ITEM.title}
                      </span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })()}
            {/* ── 4단계 퍼널 스텝 메뉴 ── */}
            {ACTION1_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.href);
              return (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton asChild isActive={active}>
                    <Link
                      href={item.href}
                      className={cn(
                        // 활성 메뉴: 인디고 왼쪽 보더 강조
                        active && "border-l-2 border-indigo-500 !text-indigo-600 dark:!text-indigo-400 !bg-indigo-500/8"
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarGroup>

        {/* ── ACTION 2 · 포트폴리오 관리 그룹 — 에메랄드 테마 ── */}
        <SidebarGroup>
          <SidebarGroupLabel className="flex items-center gap-1.5 mb-1">
            {/* ACTION 번호를 컬러 배지로 강조 — 에메랄드 */}
            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 ring-1 ring-inset ring-emerald-500/20">
              <Briefcase className="h-2.5 w-2.5" />
              ACTION 2
            </span>
            <span className="text-[10px] font-semibold text-muted-foreground tracking-wide">포트폴리오 관리</span>
          </SidebarGroupLabel>
          <SidebarMenu>
            {ACTION2_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.href);
              return (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton asChild isActive={active}>
                    <Link
                      href={item.href}
                      className={cn(
                        // 활성 메뉴: 에메랄드 왼쪽 보더 강조
                        active && "border-l-2 border-emerald-500 !text-emerald-600 dark:!text-emerald-400 !bg-emerald-500/8"
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarGroup>

        {/* ── ACTION 3 · 자동화 루틴 그룹 — 앰버 테마 ── */}
        <SidebarGroup>
          <SidebarGroupLabel className="flex items-center gap-1.5 mb-1">
            {/* ACTION 번호를 컬러 배지로 강조 — 앰버 */}
            <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-bold text-amber-600 dark:text-amber-400 ring-1 ring-inset ring-amber-500/20">
              <Zap className="h-2.5 w-2.5" />
              ACTION 3
            </span>
            <span className="text-[10px] font-semibold text-muted-foreground tracking-wide">자동화 루틴</span>
          </SidebarGroupLabel>
          <SidebarMenu>
            {ACTION3_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.href);
              return (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton asChild isActive={active}>
                    <Link
                      href={item.href}
                      className={cn(
                        // 활성 메뉴: 앰버 왼쪽 보더 강조
                        active && "border-l-2 border-amber-500 !text-amber-600 dark:!text-amber-400 !bg-amber-500/8"
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarGroup>

        {/* ── 설정 그룹 ── */}
        <SidebarGroup>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                isActive={isActive("/dashboard/settings")}
              >
                <Link href="/dashboard/settings">
                  <Settings className="h-4 w-4" />
                  <span>설정</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      {/* ── 사이드바 하단: 사용자 메뉴 — 구분감 있는 배경 ── */}
      <SidebarFooter className="border-t bg-muted/30 dark:bg-slate-900/50 p-3">
        <UserMenu />
      </SidebarFooter>
    </Sidebar>
  );
}
