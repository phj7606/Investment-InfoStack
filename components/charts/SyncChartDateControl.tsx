"use client";

// 시장 분석 탭 — 날짜 범위 컨트롤 컴포넌트
// 모든 차트가 공유하는 Start Date / End Date / Period 선택 UI

import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { DateRange, PeriodLabel } from "@/types/market-analysis";

/** 기간 버튼 목록 — 클릭 시 오늘 기준 역산 */
const PERIOD_OPTIONS: { label: PeriodLabel; days: number }[] = [
  { label: "1M", days: 30 },
  { label: "3M", days: 91 },
  { label: "6M", days: 182 },
  { label: "1Y", days: 365 },
  { label: "2Y", days: 730 },
  { label: "5Y", days: 1825 },
];

interface SyncChartDateControlProps {
  startDate: string;
  endDate: string;
  period: PeriodLabel;
  onRangeChange: (start: string, end: string, period: PeriodLabel) => void;
}

// KST(UTC+9) 환경에서 toISOString()은 UTC 기준 → 자정 이전 접속 시 날짜 1일 밀림 방지
function toIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function SyncChartDateControl({
  startDate,
  endDate,
  period,
  onRangeChange,
}: SyncChartDateControlProps) {
  /** 기간 버튼 클릭 — 오늘 기준으로 시작일 역산 */
  function handlePeriodClick(opt: (typeof PERIOD_OPTIONS)[number]) {
    const end = toIsoDate(new Date());
    const start = toIsoDate(
      new Date(Date.now() - opt.days * 86400 * 1000)
    );
    onRangeChange(start, end, opt.label);
  }

  /** 직접 날짜 입력 시 period를 "custom"으로 처리 */
  function handleStartChange(value: string) {
    if (!value) return;
    onRangeChange(value, endDate, "custom");
  }

  function handleEndChange(value: string) {
    if (!value) return;
    onRangeChange(startDate, value, "custom");
  }

  return (
    <div className="flex flex-wrap gap-6 items-end pb-4 border-b border-border">
      {/* 시작일 입력 */}
      <div className="space-y-1.5 min-w-36">
        <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Start Date
        </Label>
        <Input
          type="date"
          value={startDate}
          max={endDate}
          onChange={(e) => handleStartChange(e.target.value)}
          className="h-9 text-sm"
        />
      </div>

      {/* 종료일 입력 */}
      <div className="space-y-1.5 min-w-36">
        <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          End Date
        </Label>
        <Input
          type="date"
          value={endDate}
          min={startDate}
          max={toIsoDate(new Date())}
          onChange={(e) => handleEndChange(e.target.value)}
          className="h-9 text-sm"
        />
      </div>

      {/* 기간 버튼 그룹 */}
      <div className="space-y-1.5">
        <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Period
        </Label>
        <div className="flex gap-1">
          {PERIOD_OPTIONS.map((opt) => (
            <Button
              key={opt.label}
              variant={period === opt.label ? "default" : "outline"}
              size="sm"
              className="h-9 min-w-10 px-3 text-xs"
              onClick={() => handlePeriodClick(opt)}
            >
              {opt.label}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
