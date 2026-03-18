"use client";

// 모든 클라이언트 전용 Provider를 한 곳에서 관리
// layout.tsx(RSC)에서 'use client' 오염 없이 Provider를 감쌀 수 있도록 분리

import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";

interface ProvidersProps {
  children: React.ReactNode;
}

export function Providers({ children }: ProvidersProps) {
  return (
    // attribute="class" → .dark 클래스로 다크 모드 적용 (Tailwind CSS 호환)
    // defaultTheme="system" → 시스템 설정 자동 감지
    // enableSystem → OS 다크 모드 설정 반영
    // disableTransitionOnChange → 테마 전환 시 불필요한 CSS transition 방지
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
      {/* 토스트 알림은 앱 최상단에 한 번만 배치 */}
      <Toaster richColors position="top-right" />
    </ThemeProvider>
  );
}
