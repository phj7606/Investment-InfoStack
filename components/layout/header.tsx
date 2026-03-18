"use client";

// 글로벌 헤더 — sticky 배치로 스크롤 중에도 내비게이션 항상 접근 가능
// 데스크탑: NavigationMenu, 모바일: MobileNav

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  navigationMenuTriggerStyle,
} from "@/components/ui/navigation-menu";
import { ThemeToggle } from "@/components/common/theme-toggle";
import { UserMenu } from "@/components/common/user-menu";
import { MobileNav } from "@/components/layout/mobile-nav";
import { NAV_ITEMS, SITE_CONFIG } from "@/lib/constants";

export function Header() {
  const pathname = usePathname();

  return (
    // sticky + backdrop-blur: 스크롤 시 콘텐츠 위에 반투명하게 고정
    <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-sm">
      <div className="container mx-auto flex h-14 items-center justify-between px-4">
        {/* 좌측: 모바일 햄버거 + 브랜드 로고 */}
        <div className="flex items-center gap-3">
          <MobileNav />
          <Link
            href="/"
            className="font-bold text-lg hover:opacity-80 transition-opacity"
          >
            {SITE_CONFIG.name}
          </Link>
        </div>

        {/* 중앙: 데스크탑 내비게이션 (md 미만에서 숨김) */}
        <NavigationMenu className="hidden md:flex">
          <NavigationMenuList>
            {NAV_ITEMS.map((item) => {
              const isActive = pathname === item.href;
              return (
                <NavigationMenuItem key={item.href}>
                  <NavigationMenuLink
                    asChild
                    className={navigationMenuTriggerStyle()}
                    data-active={isActive}
                  >
                    <Link href={item.href}>{item.title}</Link>
                  </NavigationMenuLink>
                </NavigationMenuItem>
              );
            })}
          </NavigationMenuList>
        </NavigationMenu>

        {/* 우측: 테마 토글 + 사용자 메뉴 */}
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
