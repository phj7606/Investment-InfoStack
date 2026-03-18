"use client";

// 대시보드 사이드바 — shadcn Sidebar 컴포넌트 기반
// 현재 경로 강조, 하단 사용자 메뉴 포함

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  BarChart3,
  Users,
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

// 사이드바 내비게이션 정의 (아이콘 컴포넌트 직접 연결)
const NAV_ITEMS = [
  { title: "대시보드", href: "/dashboard", icon: LayoutDashboard },
  { title: "분석", href: "/dashboard/analytics", icon: BarChart3 },
  { title: "사용자", href: "/dashboard/users", icon: Users },
  { title: "설정", href: "/dashboard/settings", icon: Settings },
];

export function DashboardSidebar() {
  const pathname = usePathname();

  return (
    <Sidebar>
      {/* 사이드바 상단: 브랜드명 */}
      <SidebarHeader className="border-b px-4 py-3">
        <Link href="/" className="font-bold text-lg">
          {SITE_CONFIG.name}
        </Link>
      </SidebarHeader>

      {/* 사이드바 본문: 내비게이션 메뉴 */}
      <SidebarContent className="px-2 py-4">
        <SidebarMenu>
          {NAV_ITEMS.map((item) => {
            // 현재 경로와 정확히 일치하는 경우만 활성화 (상위 경로 오염 방지)
            const isActive = pathname === item.href;
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
