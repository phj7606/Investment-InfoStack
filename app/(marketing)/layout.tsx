// 마케팅 레이아웃 — Header + 콘텐츠 영역 + Footer
// RSC: 레이아웃 자체는 정적, 내부 컴포넌트가 필요에 따라 'use client' 사용

import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // min-h-screen + flex flex-col: 콘텐츠가 짧아도 Footer가 하단에 위치
    <div className="flex flex-col min-h-screen">
      <Header />
      {/* flex-1: 남은 공간 모두 차지하여 Footer를 항상 하단에 고정 */}
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}
