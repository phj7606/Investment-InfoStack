// 대시보드 레이아웃 — SidebarProvider + 사이드바 + 메인 콘텐츠
// SidebarProvider: 접기/펼치기 상태를 하위 컴포넌트에 Context로 전달

import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { DashboardSidebar } from "@/components/layout/dashboard-sidebar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // SidebarProvider가 sidebar 열림/닫힘 상태 관리
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <DashboardSidebar />
        {/* 사이드바 우측 메인 콘텐츠 영역 */}
        <div className="flex flex-1 flex-col">
          {/* 상단 바: 사이드바 토글 버튼
              높이 계산: py-3.5(14px×2=28px) + 텍스트 2줄(~30px) = 58px */}
          <header className="flex h-[56px] items-center px-4">
            {/* SidebarTrigger: 사이드바 접기/펼치기 토글 버튼 */}
            <SidebarTrigger />
          </header>
          <main className="flex-1 p-6">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}
