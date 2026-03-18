"use client";

// 모바일 햄버거 메뉴 — Sheet(슬라이드 드로어) 기반
// 현재 경로 강조 표시로 사용자 위치 안내

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { NAV_ITEMS, SITE_CONFIG } from "@/lib/constants";

export function MobileNav() {
  // Sheet 열림/닫힘 상태 — 링크 클릭 시 자동으로 닫히도록
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      {/* 햄버거 버튼 — md 이상에서는 숨김 */}
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden">
          <Menu className="h-5 w-5" />
          <span className="sr-only">메뉴 열기</span>
        </Button>
      </SheetTrigger>

      {/* 좌측에서 슬라이드인 — 모바일 기본 탐색 패턴 */}
      <SheetContent side="left" className="w-72">
        <SheetHeader>
          <SheetTitle className="text-left">{SITE_CONFIG.name}</SheetTitle>
        </SheetHeader>
        <nav className="flex flex-col gap-1 mt-6">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                // 링크 클릭 시 Sheet 닫기 — 페이지 이동 후 메뉴가 열려있는 불편함 방지
                onClick={() => setOpen(false)}
                className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-accent hover:text-accent-foreground"
                }`}
              >
                {item.title}
              </Link>
            );
          })}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
