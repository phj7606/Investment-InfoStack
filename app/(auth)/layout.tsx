// 인증 레이아웃 — 로고 + 중앙 카드 형태
// 로그인/회원가입 페이지에 집중감 있는 단순 레이아웃 제공

import Link from "next/link";
import { SITE_CONFIG } from "@/lib/constants";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // 화면 전체 높이에서 수직/수평 중앙 정렬
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted/30 px-4">
      {/* 상단 로고 — 브랜드 인식 및 홈으로 돌아가는 탈출구 */}
      <Link
        href="/"
        className="mb-8 font-bold text-2xl hover:opacity-80 transition-opacity"
      >
        {SITE_CONFIG.name}
      </Link>
      {/* 카드 형태 콘텐츠 영역 — 배경과 구분되어 집중도 향상 */}
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}
