// Step 3(실적 채점)은 Step 2(종목 분석)에 통합됨 (Phase 8)
// /dashboard/screen 탭 "실적 채점"으로 redirect

import { redirect } from "next/navigation";

export default function EarningsAnalysisPage() {
  redirect("/dashboard/screen");
}
