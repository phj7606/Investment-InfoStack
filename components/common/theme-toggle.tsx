"use client";

// 다크/라이트 테마 전환 버튼
// SSR 환경에서 테마를 알 수 없으므로 마운트 전 Skeleton으로 레이아웃 유지

import { useTheme } from "next-themes";
import { useIsClient } from "usehooks-ts";
import { Sun, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  // useIsClient: 클라이언트 하이드레이션 완료 여부 감지 (usehooks-ts 제공)
  const isClient = useIsClient();

  // 서버 렌더링 또는 하이드레이션 전: 동일한 크기의 Skeleton으로 레이아웃 시프트 방지
  if (!isClient) {
    return <Skeleton className="h-9 w-9 rounded-md" />;
  }

  // 현재 테마에 따라 반대 테마로 전환
  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark");
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggleTheme}
      aria-label={theme === "dark" ? "라이트 모드로 전환" : "다크 모드로 전환"}
    >
      {/* 다크 모드: 태양 아이콘(라이트로 전환), 라이트 모드: 달 아이콘(다크로 전환) */}
      {theme === "dark" ? (
        <Sun className="h-4 w-4" />
      ) : (
        <Moon className="h-4 w-4" />
      )}
    </Button>
  );
}
