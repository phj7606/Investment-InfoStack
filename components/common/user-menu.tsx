"use client";

// 사용자 아바타 + 드롭다운 메뉴 조합 컴포넌트
// 헤더와 사이드바 하단 모두에서 재사용

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { User, Settings, LogOut } from "lucide-react";

interface UserMenuProps {
  // 컴팩트 모드: 사이드바 하단에서 이름/이메일 텍스트 숨김
  compact?: boolean;
}

export function UserMenu({ compact = false }: UserMenuProps) {
  return (
    <DropdownMenu>
      {/* 아바타 클릭으로 드롭다운 열기 */}
      {/* suppressHydrationWarning: Radix UI가 SSR/CSR에서 서로 다른 랜덤 id를 생성하여 발생하는 hydration 불일치 경고 억제 */}
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-2 rounded-md p-1 hover:bg-accent transition-colors" suppressHydrationWarning>
          <Avatar className="h-8 w-8">
            {/* src 미지정: 실제 API 연동 전까지 빈 문자열로 불필요한 404 요청 방지 */}
            <AvatarImage alt="사용자 프로필" />
            {/* 이미지 없을 때 이름 이니셜 표시 */}
            <AvatarFallback className="text-xs font-medium">U</AvatarFallback>
          </Avatar>
          {/* compact 모드(사이드바 접힌 상태 등)에서는 텍스트 숨김 */}
          {!compact && (
            <div className="text-left hidden sm:block">
              <p className="text-sm font-medium leading-none">사용자</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                user@example.com
              </p>
            </div>
          )}
        </button>
      </DropdownMenuTrigger>

      {/* 드롭다운 메뉴: 우측 정렬로 헤더 밖으로 넘치지 않도록 */}
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel>내 계정</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem>
          <User className="mr-2 h-4 w-4" />
          프로필
        </DropdownMenuItem>
        <DropdownMenuItem>
          <Settings className="mr-2 h-4 w-4" />
          설정
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-destructive focus:text-destructive">
          <LogOut className="mr-2 h-4 w-4" />
          로그아웃
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
