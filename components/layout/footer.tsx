// 글로벌 푸터 — 마케팅 레이아웃 하단 고정
// RSC: 정적 콘텐츠만 포함, 서버 렌더링

import Link from "next/link";
import { Github } from "lucide-react";
import { SITE_CONFIG } from "@/lib/constants";

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="border-t bg-background">
      <div className="container mx-auto px-4 py-10">
        {/* 3컬럼 그리드 — 모바일에서는 세로 스택 */}
        <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
          {/* 컬럼 1: 브랜드 소개 */}
          <div>
            <h3 className="font-bold text-lg mb-2">{SITE_CONFIG.name}</h3>
            <p className="text-sm text-muted-foreground">
              {SITE_CONFIG.description}
            </p>
          </div>

          {/* 컬럼 2: 내부 링크 */}
          <div>
            <h4 className="font-semibold mb-3">링크</h4>
            <ul className="space-y-2">
              <li>
                <Link
                  href="/"
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  홈
                </Link>
              </li>
              <li>
                <Link
                  href="/dashboard"
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  대시보드
                </Link>
              </li>
              <li>
                <Link
                  href="/login"
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  로그인
                </Link>
              </li>
            </ul>
          </div>

          {/* 컬럼 3: 소셜 링크 */}
          <div>
            <h4 className="font-semibold mb-3">소셜</h4>
            {SITE_CONFIG.links.github && (
              <a
                href={SITE_CONFIG.links.github}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <Github className="h-4 w-4" />
                GitHub
              </a>
            )}
          </div>
        </div>

        {/* 저작권 표시 — 하단 구분선 이후 */}
        <div className="mt-8 pt-6 border-t text-center text-sm text-muted-foreground">
          © {currentYear} {SITE_CONFIG.name}. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
