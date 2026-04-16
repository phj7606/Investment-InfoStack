// Investment+ 홈 페이지 (Phase 7 — UI 리디자인)
// 3개 Action 워크플로우 카드로 전체 플로우 진입점 제공
// 각 Action별 컬러 테마 적용: ACTION 1=인디고, ACTION 2=에메랄드, ACTION 3=앰버

import Link from "next/link";
import { ArrowRight, Search, BookOpen, Zap, ChevronRight } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

// ACTION 1 Step 진행 표시 라벨 (5단계 퍼널 — 순서대로 종목을 압축)
const ACTION1_STEPS = [
  { label: "섹터 조감", step: 1 },
  { label: "종목 압축", step: 2 },
  { label: "실적 채점", step: 3 },
  { label: "체크포인트", step: 4 },
  { label: "매수 결정", step: 5 },
];

export default function DashboardPage() {
  return (
    <div className="min-h-full">
      {/* ── 헤더 영역: 그라디언트 배경으로 브랜드 임팩트 강화 ── */}
      <div className="relative overflow-hidden border-b bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
        {/* 배경 장식 패턴: 미묘한 그리드 텍스처 */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, white 1px, transparent 0)",
            backgroundSize: "32px 32px",
          }}
        />
        {/* 우상단 글로우 효과 */}
        <div className="absolute -top-24 -right-24 w-64 h-64 rounded-full bg-indigo-500/10 blur-3xl" />
        <div className="absolute -bottom-16 -left-16 w-48 h-48 rounded-full bg-blue-500/10 blur-3xl" />

        <div className="relative px-8 py-10 max-w-5xl mx-auto">
          {/* 상단 태그라인 */}
          <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 mb-4">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs font-medium text-white/70 tracking-wide">1인 투자 하우스 시스템</span>
          </div>

          {/* 메인 타이틀 — 임팩트 있는 타이포그래피 */}
          <h1 className="text-4xl font-black tracking-tight text-white leading-none">
            Investment<span className="text-indigo-400">+</span>
          </h1>
          <p className="text-slate-400 mt-2 text-sm font-medium">
            종목 탐색부터 자동화 루틴까지 — 3단계 워크플로우로 투자 결정을 체계화합니다
          </p>
        </div>
      </div>

      {/* ── 3개 Action 워크플로우 카드 그리드 ── */}
      <div className="p-8 max-w-5xl mx-auto">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">

          {/* ── ACTION 1 카드 — 종목 탐색 (인디고/파란 계열) ── */}
          <Card className="group flex flex-col overflow-hidden border-indigo-100 dark:border-indigo-900/50 transition-all duration-300 hover:scale-[1.02] hover:shadow-xl hover:shadow-indigo-500/10 hover:border-indigo-300 dark:hover:border-indigo-700">
            {/* 카드 상단 컬러 배너: 인디고 그라디언트 스트라이프 */}
            <div className="h-1.5 w-full bg-gradient-to-r from-indigo-500 via-blue-500 to-indigo-600" />

            <CardHeader className="pb-3">
              {/* ACTION 번호 배지 + 아이콘 행 */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2.5">
                  {/* 인디고 계열 아이콘 컨테이너 */}
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 ring-1 ring-indigo-500/20">
                    <Search className="h-4 w-4" />
                  </div>
                  <div>
                    {/* ACTION 번호 레이블 */}
                    <span className="text-[10px] font-bold text-indigo-500 dark:text-indigo-400 uppercase tracking-widest">
                      ACTION 1
                    </span>
                  </div>
                </div>
                {/* 오른쪽 순서 번호 표시 */}
                <span className="text-3xl font-black text-indigo-100 dark:text-indigo-900/80 select-none">
                  01
                </span>
              </div>
              <CardTitle className="text-lg font-bold">종목 탐색</CardTitle>
              <CardDescription className="text-sm leading-relaxed">
                섹터 조감부터 매수 결정까지 5단계 퍼널로 종목을 압축합니다.
              </CardDescription>
            </CardHeader>

            <CardContent className="flex flex-col gap-4 flex-1 pt-0">
              {/* 5단계 퍼널 시각화 — 번호 원형 + 화살표 연결 */}
              <div className="flex items-center gap-0.5">
                {ACTION1_STEPS.map((s, i) => (
                  <div key={s.step} className="flex items-center gap-0.5 flex-1">
                    {/* Step 원형 배지 */}
                    <div className="flex flex-col items-center flex-1 gap-1">
                      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 text-[10px] font-black ring-1 ring-indigo-500/30">
                        {s.step}
                      </div>
                      {/* Step 레이블 — 줄바꿈 허용 */}
                      <span className="text-[9px] font-medium text-muted-foreground text-center leading-tight">
                        {s.label}
                      </span>
                    </div>
                    {/* Step 연결선 — 마지막 항목 제외 */}
                    {i < ACTION1_STEPS.length - 1 && (
                      <ChevronRight className="h-3 w-3 shrink-0 text-indigo-300 dark:text-indigo-700 -mx-0.5 mt-[-14px]" />
                    )}
                  </div>
                ))}
              </div>

              {/* 탐색 시작 버튼 — 인디고 그라디언트 */}
              <div className="mt-auto pt-2">
                <Button
                  asChild
                  className="w-full gap-2 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white border-0 shadow-md shadow-indigo-500/20 transition-all duration-200"
                >
                  <Link href="/dashboard/sector">
                    탐색 시작
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* ── ACTION 2 카드 — 추적 관찰 (에메랄드/그린 계열) ── */}
          <Card className="group flex flex-col overflow-hidden border-emerald-100 dark:border-emerald-900/50 transition-all duration-300 hover:scale-[1.02] hover:shadow-xl hover:shadow-emerald-500/10 hover:border-emerald-300 dark:hover:border-emerald-700">
            {/* 카드 상단 컬러 배너: 에메랄드 그라디언트 */}
            <div className="h-1.5 w-full bg-gradient-to-r from-emerald-500 via-green-500 to-teal-500" />

            <CardHeader className="pb-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2.5">
                  {/* 에메랄드 계열 아이콘 컨테이너 */}
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-1 ring-emerald-500/20">
                    <BookOpen className="h-4 w-4" />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-emerald-500 dark:text-emerald-400 uppercase tracking-widest">
                      ACTION 2
                    </span>
                  </div>
                </div>
                <span className="text-3xl font-black text-emerald-100 dark:text-emerald-900/80 select-none">
                  02
                </span>
              </div>
              <CardTitle className="text-lg font-bold">추적 관찰</CardTitle>
              <CardDescription className="text-sm leading-relaxed">
                보유 종목 Thesis를 관리하고, Catalyst 이벤트를 추적합니다.
              </CardDescription>
            </CardHeader>

            <CardContent className="flex flex-col gap-4 flex-1 pt-0">
              {/* 활성 Thesis 요약 카드 — TODO: Phase 9에서 실제 데이터로 교체 */}
              <div className="rounded-xl bg-emerald-500/5 border border-emerald-500/10 px-4 py-3.5">
                <p className="text-xs font-medium text-emerald-600/70 dark:text-emerald-400/60 uppercase tracking-wide">
                  활성 Thesis
                </p>
                <p className="text-2xl font-black mt-0.5 text-emerald-700 dark:text-emerald-400">
                  0건
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  탐색 완료 후 Thesis를 등록하세요
                </p>
              </div>

              <div className="mt-auto pt-2">
                <Button
                  asChild
                  className="w-full gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white border-0 shadow-md shadow-emerald-500/20 transition-all duration-200"
                >
                  <Link href="/dashboard/thesis">
                    Thesis 확인
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* ── ACTION 3 카드 — 자동화 루틴 (앰버/오렌지 계열) ── */}
          <Card className="group flex flex-col overflow-hidden border-amber-100 dark:border-amber-900/50 transition-all duration-300 hover:scale-[1.02] hover:shadow-xl hover:shadow-amber-500/10 hover:border-amber-300 dark:hover:border-amber-700">
            {/* 카드 상단 컬러 배너: 앰버 그라디언트 */}
            <div className="h-1.5 w-full bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600" />

            <CardHeader className="pb-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2.5">
                  {/* 앰버 계열 아이콘 컨테이너 */}
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 ring-1 ring-amber-500/20">
                    <Zap className="h-4 w-4" />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-amber-500 dark:text-amber-400 uppercase tracking-widest">
                      ACTION 3
                    </span>
                  </div>
                </div>
                <span className="text-3xl font-black text-amber-100 dark:text-amber-900/80 select-none">
                  03
                </span>
              </div>
              <CardTitle className="text-lg font-bold">자동화 루틴</CardTitle>
              <CardDescription className="text-sm leading-relaxed">
                Morning Note 자동 생성, 주간·월간 리뷰를 자동화합니다.
              </CardDescription>
            </CardHeader>

            <CardContent className="flex flex-col gap-4 flex-1 pt-0">
              {/* Morning Note 최근 생성 상태 — TODO: Phase 10에서 실제 데이터로 교체 */}
              <div className="rounded-xl bg-amber-500/5 border border-amber-500/10 px-4 py-3.5">
                <p className="text-xs font-medium text-amber-600/70 dark:text-amber-400/60 uppercase tracking-wide">
                  Morning Note
                </p>
                <p className="text-sm font-semibold mt-1 text-muted-foreground">
                  아직 생성된 노트가 없습니다
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  매일 아침 시장 요약을 자동 생성하세요
                </p>
              </div>

              <div className="mt-auto pt-2">
                <Button
                  asChild
                  className="w-full gap-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-white border-0 shadow-md shadow-amber-500/20 transition-all duration-200"
                >
                  <Link href="/dashboard/morning-note">
                    Morning Note
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>

        </div>
      </div>
    </div>
  );
}
