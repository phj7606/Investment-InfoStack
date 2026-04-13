"use client";

// 분석 리포트 렌더링 컴포넌트 (P5-03, P5-06)
// - streaming 중: 전체 텍스트 실시간 렌더링 (스크롤 추적)
// - complete: 섹션별 Tabs로 전환 + 저장 버튼

import { useEffect, useRef, useMemo } from "react";
import { Download, Save, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { MarkdownRenderer } from "./MarkdownRenderer";
import { SECTION_HEADINGS } from "@/lib/company-analysis/prompts";
import type { CompanyAnalysisResult, StreamingStatus } from "@/types/company-analysis";

interface AnalysisReportProps {
  status: StreamingStatus;
  streamingText: string;
  result: CompanyAnalysisResult | null;
  onDownload: () => void;
  onSaveToHistory: () => void;
}

// 보고서 Markdown을 ## 헤딩 기준으로 섹션 분할
// 각 섹션의 시작 헤딩 이후 다음 헤딩 전까지의 내용을 추출
function parseSections(markdown: string): Record<string, string> {
  const headingValues = Object.values(SECTION_HEADINGS);
  const sections: Record<string, string> = {};

  for (let i = 0; i < headingValues.length; i++) {
    const heading = headingValues[i];
    const nextHeading = headingValues[i + 1];
    const start = markdown.indexOf(heading);
    if (start === -1) continue;

    const end = nextHeading ? markdown.indexOf(nextHeading) : markdown.length;
    sections[heading] = markdown.slice(start, end !== -1 ? end : markdown.length).trim();
  }

  // 섹션 구분 전 앞부분 (제목, 기본 정보 등)
  const firstSectionStart = Math.min(
    ...headingValues.map((h) => markdown.indexOf(h)).filter((i) => i !== -1)
  );
  if (firstSectionStart > 0) {
    sections["__header__"] = markdown.slice(0, firstSectionStart).trim();
  }

  return sections;
}

// 탭 레이블 정의
const TAB_LABELS = [
  { key: SECTION_HEADINGS.executive, short: "Executive Summary", full: "투자의견 요약" },
  { key: SECTION_HEADINGS.overview, short: "기업 개요", full: "기업 개요 및 사업현황" },
  { key: SECTION_HEADINGS.financial, short: "실적·재무", full: "실적 분석 및 재무 현황" },
  { key: SECTION_HEADINGS.momentum, short: "모멘텀·리스크", full: "투자 모멘텀 및 리스크" },
  { key: SECTION_HEADINGS.technical, short: "기술적 분석", full: "기술적 분석" },
  { key: SECTION_HEADINGS.conclusion, short: "종합 의견", full: "종합 의견" },
] as const;

export function AnalysisReport({
  status,
  streamingText,
  result,
  onDownload,
  onSaveToHistory,
}: AnalysisReportProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // 스트리밍 중 자동 하단 스크롤
  useEffect(() => {
    if (status === "streaming" && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [streamingText, status]);

  // 완료 시 섹션 파싱 (메모이제이션)
  const sections = useMemo(
    () => (result ? parseSections(result.reportMarkdown) : {}),
    [result]
  );

  if (status === "idle") return null;

  return (
    <Card className="mt-4">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base">
              {result
                ? `${result.companyName} (${result.ticker}) 분석 보고서`
                : "분석 보고서 생성 중"}
            </CardTitle>
            {status === "streaming" && (
              <Badge variant="secondary" className="gap-1 text-xs">
                <Loader2 className="h-3 w-3 animate-spin" />
                생성 중
              </Badge>
            )}
            {status === "complete" && (
              <Badge variant="outline" className="text-xs text-green-600">
                완료
              </Badge>
            )}
          </div>

          {/* 완료 후 저장 버튼 표시 */}
          {status === "complete" && result && (
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={onSaveToHistory}
                className="gap-1.5 h-8 text-xs"
              >
                <Save className="h-3.5 w-3.5" />
                이력 저장
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={onDownload}
                className="gap-1.5 h-8 text-xs"
              >
                <Download className="h-3.5 w-3.5" />
                MD 다운로드
              </Button>
            </div>
          )}
        </div>

        {/* 완료 후 메타 정보 표시 */}
        {status === "complete" && result && (
          <p className="text-xs text-muted-foreground">
            {result.exchange} · 분석일:{" "}
            {new Date(result.generatedAt).toLocaleDateString("ko-KR")}
          </p>
        )}
      </CardHeader>

      <CardContent>
        {/* 스트리밍 중: 전체 텍스트 실시간 렌더링 */}
        {status === "streaming" && (
          <div
            ref={scrollRef}
            className="max-h-[600px] overflow-y-auto pr-1"
          >
            <MarkdownRenderer content={streamingText} />
            {/* 스트리밍 커서 표시 */}
            <span className="inline-block w-2 h-4 bg-primary animate-pulse ml-0.5 align-middle" />
          </div>
        )}

        {/* 완료: 섹션별 Tabs */}
        {status === "complete" && result && (
          <Tabs defaultValue="executive">
            <TabsList className="flex-wrap h-auto gap-1 mb-4">
              {TAB_LABELS.map((tab) => (
                <TabsTrigger
                  key={tab.key}
                  value={tab.short.toLowerCase().replace(/\s+/g, "-").replace(/·/g, "")}
                  className="text-xs"
                >
                  {tab.short}
                </TabsTrigger>
              ))}
              {/* 전체 보기 탭 */}
              <TabsTrigger value="full" className="text-xs">
                전체
              </TabsTrigger>
            </TabsList>

            {TAB_LABELS.map((tab) => (
              <TabsContent
                key={tab.key}
                value={tab.short.toLowerCase().replace(/\s+/g, "-").replace(/·/g, "")}
                className="mt-0"
              >
                <div className="max-h-[600px] overflow-y-auto pr-1">
                  {sections[tab.key] ? (
                    <MarkdownRenderer content={sections[tab.key]} />
                  ) : (
                    <p className="text-sm text-muted-foreground py-4 text-center">
                      해당 섹션 정보가 없습니다.
                    </p>
                  )}
                </div>
              </TabsContent>
            ))}

            {/* 전체 보기 */}
            <TabsContent value="full" className="mt-0">
              <div className="max-h-[600px] overflow-y-auto pr-1">
                <MarkdownRenderer content={result.reportMarkdown} />
              </div>
            </TabsContent>
          </Tabs>
        )}

        {/* 에러 상태 */}
        {status === "error" && (
          <p className="text-sm text-destructive py-4">
            분석 중 오류가 발생했습니다. 다시 시도해주세요.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
