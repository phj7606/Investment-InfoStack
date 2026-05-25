"use client";

// Radix UI Tabs의 useId 기반 aria-controls가 SSR/CSR 간 불일치하여
// 발생하는 hydration 에러를 방지하기 위해 ssr:false로 동적 임포트.
// next/dynamic의 ssr:false는 "use client" 컴포넌트 안에서만 허용된다.

import dynamic from "next/dynamic";

const PensionAccountDashboardClient = dynamic(
  () => import("./PensionAccountDashboardClient").then((m) => m.PensionAccountDashboardClient),
  { ssr: false }
);

export function PensionDashboardNoSSR() {
  return <PensionAccountDashboardClient />;
}
