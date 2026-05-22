"use client";

// 분석 리포트 렌더링 컴포넌트 (P5-03, P5-06)
// - streaming 중: 전체 텍스트 실시간 렌더링 (스크롤 추적)
// - complete: 섹션별 Tabs로 전환 + 저장/다운로드/PDF 버튼
//
// PDF 출력: 새 창에 렌더링된 HTML을 복사 후 window.print() 호출
// → 브라우저 기본 인쇄 다이얼로그 → "PDF로 저장" 선택

import { useEffect, useRef, useMemo, useCallback } from "react";
import { CloudDownload, Save, Loader2, Printer } from "lucide-react";
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

  // 첫 섹션 이전 헤더 블록 (기업명, 분석일 등)
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

// ── 인쇄용 CSS ────────────────────────────────────────────────────────
// 새 창에서만 사용 — Tailwind 없이 시맨틱 HTML 태그를 직접 스타일링
const PRINT_STYLES = `
  * { box-sizing: border-box; }
  body {
    font-family: 'Apple SD Gothic Neo', 'Malgun Gothic', 'Noto Sans KR', sans-serif;
    max-width: 900px; margin: 0 auto; padding: 32px;
    color: #1a1a1a; line-height: 1.65; font-size: 14px;
  }
  h1 { font-size: 22px; font-weight: 700; border-bottom: 2px solid #222; padding-bottom: 8px; margin: 0 0 16px; }
  h2 { font-size: 17px; font-weight: 700; border-bottom: 1px solid #ccc; padding-bottom: 4px; margin: 24px 0 12px; color: #1a1a2e; }
  h3 { font-size: 15px; font-weight: 600; margin: 18px 0 8px; }
  h4 { font-size: 14px; font-weight: 600; margin: 12px 0 6px; }
  p { margin: 0 0 10px; }
  ul, ol { padding-left: 24px; margin: 0 0 10px; }
  li { margin: 2px 0; }
  table { border-collapse: collapse; width: 100%; margin: 12px 0; page-break-inside: avoid; }
  th { background: #f0f0f0; font-weight: 600; padding: 7px 10px; border: 1px solid #ccc; text-align: left; font-size: 13px; }
  td { padding: 7px 10px; border: 1px solid #ccc; font-size: 13px; }
  pre { background: #f5f5f5; padding: 12px; border-radius: 4px; overflow-x: auto; margin: 10px 0; page-break-inside: avoid; }
  code { font-family: 'Courier New', Consolas, monospace; font-size: 12px; background: #f0f0f0; padding: 1px 4px; border-radius: 2px; }
  pre code { background: none; padding: 0; }
  hr { border: none; border-top: 1px solid #ddd; margin: 16px 0; }
  blockquote { border-left: 3px solid #aaa; padding: 4px 0 4px 12px; margin: 10px 0; color: #555; font-style: italic; }
  strong { font-weight: 700; }
  em { font-style: italic; }
  @page { margin: 15mm 12mm; size: A4; }
  @media print { body { padding: 0; } }
`;

export function AnalysisReport({
  status,
  streamingText,
  result,
  onDownload,
  onSaveToHistory,
}: AnalysisReportProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  // 인쇄 전용 렌더링 영역 — 화면에 숨기되 DOM 유지, innerHTML 추출용
  const printContentRef = useRef<HTMLDivElement>(null);

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

  // PDF 저장 — 렌더링된 HTML을 새 창으로 열어 브라우저 인쇄 다이얼로그 호출
  // 브라우저 기본 "PDF로 저장" 기능 활용 (추가 라이브러리 없음)
  const handlePrint = useCallback(() => {
    if (!printContentRef.current || !result) return;

    const content = printContentRef.current.innerHTML;
    const title = `${result.companyName} (${result.ticker}) 분석 보고서`;

    const w = window.open("", "_blank", "width=960,height=760");
    if (!w) {
      alert("팝업이 차단되었습니다. 브라우저에서 팝업을 허용해주세요.");
      return;
    }

    w.document.write(`<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <title>${title}</title>
  <style>${PRINT_STYLES}</style>
</head>
<body>
${content}
</body>
</html>`);

    w.document.close();
    w.focus();
    // 렌더링 완료 후 인쇄 다이얼로그 열기
    setTimeout(() => w.print(), 400);
  }, [result]);

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

          {/* 완료 후 액션 버튼 — 이력 저장 / MD 다운로드 / PDF 저장 */}
          {status === "complete" && result && (
            <div className="flex gap-2 flex-wrap">
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
                <CloudDownload className="h-3.5 w-3.5" />
                MD 저장
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handlePrint}
                className="gap-1.5 h-8 text-xs"
              >
                <Printer className="h-3.5 w-3.5" />
                PDF 저장
              </Button>
            </div>
          )}
        </div>

        {/* 완료 후 메타 정보 */}
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
          <div ref={scrollRef} className="max-h-[600px] overflow-y-auto pr-1">
            <MarkdownRenderer content={streamingText} />
            {/* 스트리밍 커서 */}
            <span className="inline-block w-2 h-4 bg-primary animate-pulse ml-0.5 align-middle" />
          </div>
        )}

        {/* 완료: 섹션별 Tabs */}
        {status === "complete" && result && (
          <>
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

            {/* 인쇄 전용 숨김 렌더링 영역 — PDF 출력 시 innerHTML 추출 */}
            {/* display:none이어도 React가 DOM에 렌더링하므로 innerHTML 접근 가능 */}
            <div ref={printContentRef} style={{ display: "none" }} aria-hidden>
              <MarkdownRenderer content={result.reportMarkdown} />
            </div>
          </>
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
