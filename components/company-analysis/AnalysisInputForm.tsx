"use client";

// 기업 분석 입력 폼 (P5-01)
// Ticker / 거래소 / 기업명(선택) 입력 → 분석 시작
// react-hook-form + zod 패턴 (기존 인증 폼과 동일)

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { CompanyAnalysisInput } from "@/types/company-analysis";

const formSchema = z.object({
  // 기업명을 기본 입력으로 사용 — 사용자가 직관적으로 기업명을 먼저 입력
  companyName: z
    .string()
    .min(1, "기업명을 입력하세요.")
    .max(100, "기업명은 100자 이하여야 합니다."),
  exchange: z.enum(["KRX", "NYSE", "NASDAQ", "TSE", "HKEX", "OTHER"]),
  ticker: z
    .string()
    .min(1, "종목코드(Ticker)를 입력하세요.")
    .max(20, "Ticker는 20자 이하여야 합니다.")
    .transform((v) => v.trim().toUpperCase()),
});

type FormValues = z.infer<typeof formSchema>;

interface AnalysisInputFormProps {
  onSubmit: (values: CompanyAnalysisInput) => void;
  isLoading: boolean;
  // 스크리너에서 종목 클릭 시 전달되는 초기값 — 없으면 빈 폼 표시
  defaultValues?: {
    ticker?: string;
    exchange?: string;
    companyName?: string;
  };
  // 이전 분석 파일 이름 — 로드된 경우 안내 문구 표시
  previousReportLabel?: string | null;
}

// 거래소 선택지 — 주요 거래소 + 기타
const EXCHANGE_OPTIONS = [
  { value: "KRX", label: "KRX (한국거래소)" },
  { value: "NYSE", label: "NYSE (뉴욕증권거래소)" },
  { value: "NASDAQ", label: "NASDAQ" },
  { value: "TSE", label: "TSE (도쿄증권거래소)" },
  { value: "HKEX", label: "HKEX (홍콩거래소)" },
  { value: "OTHER", label: "기타" },
] as const;

export function AnalysisInputForm({ onSubmit, isLoading, defaultValues, previousReportLabel }: AnalysisInputFormProps) {
  const initialExchange = (defaultValues?.exchange ?? "KRX") as FormValues["exchange"];

  const {
    register,
    handleSubmit,
    setValue,
    reset,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      // 기업명을 첫 번째 필드로 설정 — 기본값은 빈 문자열
      companyName: defaultValues?.companyName ?? "",
      exchange: initialExchange,
      ticker: defaultValues?.ticker ?? "",
    },
  });

  // defaultValues가 외부에서 변경될 때(저장된 항목 복원 등) 폼 값 동기화
  // react-hook-form defaultValues는 마운트 시 1회만 적용되므로 reset으로 강제 업데이트
  useEffect(() => {
    if (!defaultValues?.ticker) return;
    reset({
      companyName: defaultValues.companyName ?? "",
      exchange: (defaultValues.exchange ?? "KRX") as FormValues["exchange"],
      ticker: defaultValues.ticker ?? "",
    });
  }, [defaultValues?.ticker, defaultValues?.exchange, defaultValues?.companyName, reset]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">재무제표</CardTitle>
        <CardDescription>
          분석할 기업의 Ticker와 거래소를 입력하세요. Claude가 최신 정보를 수집하여 분석
          보고서를 작성합니다.
          {/* 이전 분석 참고 중일 때 안내 */}
          {previousReportLabel && (
            <span className="block mt-1 text-indigo-600 dark:text-indigo-400 font-medium">
              이전 분석 참고 중 — 비교 분석이 추가됩니다.
            </span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={handleSubmit((values) => onSubmit(values as CompanyAnalysisInput))}
          className="flex flex-wrap gap-3 items-end"
        >
          {/* 기업명 — 기본 검색 입력 (필수) */}
          <div className="space-y-1.5 min-w-40">
            <Label htmlFor="companyName" className="text-xs font-medium">
              기업명 <span className="text-destructive">*</span>
            </Label>
            <Input
              id="companyName"
              placeholder="예: 삼성전자, Apple Inc."
              className="h-9"
              {...register("companyName")}
              disabled={isLoading}
            />
            {errors.companyName && (
              <p className="text-xs text-destructive">{errors.companyName.message}</p>
            )}
          </div>

          {/* 거래소 선택 */}
          <div className="space-y-1.5 min-w-44">
            <Label htmlFor="exchange" className="text-xs font-medium">
              거래소 <span className="text-destructive">*</span>
            </Label>
            <Select
              value={watch("exchange")}
              onValueChange={(v) =>
                setValue("exchange", v as FormValues["exchange"], { shouldValidate: true })
              }
              disabled={isLoading}
            >
              <SelectTrigger id="exchange" className="h-9">
                <SelectValue placeholder="거래소 선택" />
              </SelectTrigger>
              <SelectContent>
                {EXCHANGE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.exchange && (
              <p className="text-xs text-destructive">{errors.exchange.message}</p>
            )}
          </div>

          {/* 종목코드(Ticker) — 기업명 입력 후 보조 입력 */}
          <div className="space-y-1.5 min-w-28">
            <Label htmlFor="ticker" className="text-xs font-medium">
              종목코드 <span className="text-destructive">*</span>
            </Label>
            <Input
              id="ticker"
              placeholder="예: 005930, AAPL"
              className="h-9 uppercase"
              {...register("ticker")}
              disabled={isLoading}
            />
            {errors.ticker && (
              <p className="text-xs text-destructive">{errors.ticker.message}</p>
            )}
          </div>

          {/* 분석 시작 버튼 */}
          <Button
            type="submit"
            disabled={isLoading}
            className="h-9 gap-1.5"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                분석 중...
              </>
            ) : (
              <>
                <Search className="h-4 w-4" />
                분석 시작
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
