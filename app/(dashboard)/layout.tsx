// 대시보드 레이아웃 — SidebarProvider + 사이드바 + 메인 콘텐츠
// SidebarProvider: 접기/펼치기 상태를 하위 컴포넌트에 Context로 전달
//
// SectorReportProvider: 페이지 이동해도 섹터 보고서 상태가 유지되도록
// 대시보드 레이아웃 수준에서 마운트 (페이지 전환 시 언마운트되지 않음)

import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { DashboardSidebar } from "@/components/layout/dashboard-sidebar";
import { SectorReportProvider } from "@/lib/sector-report/context";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // SidebarProvider가 sidebar 열림/닫힘 상태 관리
    <SidebarProvider>
      {/* SectorReportProvider: 대시보드 레벨 전역 — 페이지 이동 후에도 보고서 상태 보존 */}
      <SectorReportProvider>
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
      </SectorReportProvider>
    </SidebarProvider>
  );
}
