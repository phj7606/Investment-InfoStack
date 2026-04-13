"use client";

// 기업 분석 입력 폼 (P5-01)
// Ticker / 거래소 / 기업명(선택) 입력 → 분석 시작
// react-hook-form + zod 패턴 (기존 인증 폼과 동일)

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
  ticker: z
    .string()
    .min(1, "Ticker를 입력하세요.")
    .max(20, "Ticker는 20자 이하여야 합니다.")
    .transform((v) => v.trim().toUpperCase()),
  exchange: z.enum(["KRX", "NYSE", "NASDAQ", "TSE", "HKEX", "OTHER"]),
  companyName: z.string().max(100).optional(),
});

type FormValues = z.infer<typeof formSchema>;

interface AnalysisInputFormProps {
  onSubmit: (values: CompanyAnalysisInput) => void;
  isLoading: boolean;
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

export function AnalysisInputForm({ onSubmit, isLoading }: AnalysisInputFormProps) {
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { exchange: "NASDAQ" },
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">기업 분석 시작</CardTitle>
        <CardDescription>
          분석할 기업의 Ticker와 거래소를 입력하세요. Claude가 최신 정보를 수집하여 분석
          보고서를 작성합니다.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={handleSubmit((values) => onSubmit(values as CompanyAnalysisInput))}
          className="flex flex-wrap gap-3 items-end"
        >
          {/* Ticker 입력 */}
          <div className="space-y-1.5 min-w-28">
            <Label htmlFor="ticker" className="text-xs font-medium">
              Ticker <span className="text-destructive">*</span>
            </Label>
            <Input
              id="ticker"
              placeholder="예: AAPL, 005930"
              className="h-9 uppercase"
              {...register("ticker")}
              disabled={isLoading}
            />
            {errors.ticker && (
              <p className="text-xs text-destructive">{errors.ticker.message}</p>
            )}
          </div>

          {/* 거래소 선택 */}
          <div className="space-y-1.5 min-w-44">
            <Label htmlFor="exchange" className="text-xs font-medium">
              거래소 <span className="text-destructive">*</span>
            </Label>
            <Select
              defaultValue="NASDAQ"
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

          {/* 기업명 (선택) */}
          <div className="space-y-1.5 min-w-40">
            <Label htmlFor="companyName" className="text-xs font-medium">
              기업명 <span className="text-muted-foreground text-xs">(선택)</span>
            </Label>
            <Input
              id="companyName"
              placeholder="예: Apple Inc."
              className="h-9"
              {...register("companyName")}
              disabled={isLoading}
            />
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
