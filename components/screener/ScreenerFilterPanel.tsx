"use client";

// 스크리너 필터 패널 클라이언트 컴포넌트
// RS Percentile 임계값, 모멘텀 Top N, MA 위/아래, 카테고리 조건 설정

import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CATEGORY_LABELS } from "@/lib/constants/categories";
import type { ScreenerFilters } from "@/types";

interface ScreenerFilterPanelProps {
  filters: ScreenerFilters;
  // 실제 데이터에서 추출한 유니크 카테고리 목록
  categories: string[];
  onChange: (filters: ScreenerFilters) => void;
  onReset: () => void;
}

export function ScreenerFilterPanel({
  filters,
  categories,
  onChange,
  onReset,
}: ScreenerFilterPanelProps) {
  // 필드 하나 변경 헬퍼 — 불변성 유지
  const update = <K extends keyof ScreenerFilters>(key: K, value: ScreenerFilters[K]) => {
    onChange({ ...filters, [key]: value });
  };

  return (
    <div className="space-y-4">
      {/* RS Percentile + 모멘텀 Top N 행 */}
      <div className="flex flex-wrap gap-6 items-end">
        {/* RS Percentile 최솟값 */}
        <div className="space-y-1.5">
          <Label htmlFor="rs-min" className="text-sm">
            RS Percentile 최솟값
          </Label>
          <div className="flex items-center gap-2">
            <Input
              id="rs-min"
              type="number"
              min={0}
              max={100}
              step={5}
              value={filters.rsPercentileMin}
              onChange={(e) => update("rsPercentileMin", Math.min(100, Math.max(0, Number(e.target.value))))}
              className="w-20 h-8"
            />
            {/* 현재 선택 범위를 직관적으로 표시 */}
            <Badge variant="secondary" className="text-xs whitespace-nowrap">
              상위 {(100 - filters.rsPercentileMin).toFixed(0)}% 이상
            </Badge>
          </div>
        </div>

        {/* 모멘텀 Top N */}
        <div className="space-y-1.5">
          <Label htmlFor="momentum-topn" className="text-sm">
            모멘텀 Top N
          </Label>
          <div className="flex items-center gap-2">
            <Input
              id="momentum-topn"
              type="number"
              min={0}
              max={50}
              step={1}
              value={filters.topNMomentum}
              onChange={(e) => update("topNMomentum", Math.max(0, Number(e.target.value)))}
              className="w-20 h-8"
            />
            <Badge variant="secondary" className="text-xs whitespace-nowrap">
              {filters.topNMomentum === 0 ? "비활성" : `상위 ${filters.topNMomentum}위 이내`}
            </Badge>
          </div>
        </div>

        {/* 카테고리 */}
        <div className="space-y-1.5">
          <Label className="text-sm">카테고리</Label>
          <Select
            value={filters.categoryFilter}
            onValueChange={(v) => update("categoryFilter", v === "_all" ? "" : v)}
          >
            <SelectTrigger className="w-40 h-8 text-sm">
              <SelectValue placeholder="전체" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">전체</SelectItem>
              {categories.map((cat) => (
                <SelectItem key={cat} value={cat}>
                  {CATEGORY_LABELS[cat] ?? cat}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* MA 필터 체크박스 행 */}
      <div className="flex flex-wrap gap-4 items-center">
        <span className="text-sm text-muted-foreground">이동평균 위:</span>

        {/* MA10 체크박스 */}
        <div className="flex items-center gap-1.5">
          <Checkbox
            id="ma10"
            checked={filters.requireMa10}
            onCheckedChange={(checked) => update("requireMa10", !!checked)}
          />
          <Label htmlFor="ma10" className="text-sm cursor-pointer">MA10</Label>
        </div>

        {/* MA20 체크박스 */}
        <div className="flex items-center gap-1.5">
          <Checkbox
            id="ma20"
            checked={filters.requireMa20}
            onCheckedChange={(checked) => update("requireMa20", !!checked)}
          />
          <Label htmlFor="ma20" className="text-sm cursor-pointer">MA20</Label>
        </div>

        {/* MA50 체크박스 */}
        <div className="flex items-center gap-1.5">
          <Checkbox
            id="ma50"
            checked={filters.requireMa50}
            onCheckedChange={(checked) => update("requireMa50", !!checked)}
          />
          <Label htmlFor="ma50" className="text-sm cursor-pointer">MA50</Label>
        </div>

        {/* 초기화 버튼 */}
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto text-xs h-7 text-muted-foreground"
          onClick={onReset}
        >
          필터 초기화
        </Button>
      </div>
    </div>
  );
}
