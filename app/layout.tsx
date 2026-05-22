import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { SITE_CONFIG } from "@/lib/constants";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// viewport는 Next.js 14+에서 metadata와 분리해야 경고 없이 동작
// themeColor: PWA 설치 시 상태바 색상 (모바일)
export const viewport: Viewport = {
  themeColor: "#0f172a",
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  title: {
    default: SITE_CONFIG.name,
    // 하위 페이지에서 title 설정 시 "페이지명 | StarterKit" 형식
    template: `%s | ${SITE_CONFIG.name}`,
  },
  description: SITE_CONFIG.description,
  // PWA manifest 연결: 브라우저가 앱 설치 프롬프트를 인식
  manifest: "/manifest.json",
  // iOS Safari "홈 화면에 추가" 시 네이티브 앱처럼 동작
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "InfoStack",
  },
  // 앱 아이콘 (Android Chrome 설치, 파비콘 등)
  icons: {
    icon: "/icons/icon-192x192.png",
    apple: "/icons/apple-touch-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning: next-themes가 서버/클라이언트 간 class 불일치를 유발하므로 필수
    <html lang="ko" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {/* Providers: ThemeProvider + Toaster 통합 관리 */}
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
