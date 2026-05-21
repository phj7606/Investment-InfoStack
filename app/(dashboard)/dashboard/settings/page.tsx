// 설정 페이지 — ETF 티커 목록 + 지표 파라미터 읽기 전용 표시
//
// RSC: config/*.json 파일을 서버 사이드에서 직접 읽어 표시
// 티커 편집/API 키/알림 설정은 백엔드 연동 후 구현 예정

import { readFileSync } from "fs";
import { join } from "path";
import { PageHeader } from "@/components/common/page-header";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CATEGORY_LABELS } from "@/lib/constants/categories";
import { BackupRestorePanel } from "@/components/settings/BackupRestorePanel";
import type { KrTicker, UsTicker } from "@/types";

// ────────────────────────────────────────────────────────────────
// params.json 타입 — 주요 섹션만 인라인으로 정의
// ────────────────────────────────────────────────────────────────

interface ParamsJson {
  cache: { historicalTTLSeconds: number; priceTTLSeconds: number; indexTTLSeconds: number };
  momentum: { periods: number[]; lookbackDays: number; topN: number };
  screener: { topN: number; minHistoryDays: number };
}

export default function SettingsPage() {
  // ─── config/*.json 서버 사이드 읽기 (RSC에서만 가능) ───
  // process.cwd()는 Next.js에서 프로젝트 루트를 반환
  const krTickers: KrTicker[] = JSON.parse(
    readFileSync(join(process.cwd(), "config/tickers_kr_etf.json"), "utf-8")
  );
  const usTickers: UsTicker[] = JSON.parse(
    readFileSync(join(process.cwd(), "config/tickers_us_etf_themes.json"), "utf-8")
  );
  const params: ParamsJson = JSON.parse(
    readFileSync(join(process.cwd(), "config/params.json"), "utf-8")
  );

  return (
    <div>
      {/* 페이지 헤더 */}
      <PageHeader
        title="설정"
        description="ETF 티커 구성 및 지표 파라미터 현황을 확인합니다."
      />

      {/* 탭: 한국 ETF | 미국 ETF | 파라미터 */}
      <Tabs defaultValue="kr" className="space-y-6">
        <TabsList>
          <TabsTrigger value="kr">한국 ETF ({krTickers.length}종)</TabsTrigger>
          <TabsTrigger value="us">미국 ETF ({usTickers.length}종)</TabsTrigger>
          <TabsTrigger value="params">파라미터</TabsTrigger>
          <TabsTrigger value="backup">백업/복원</TabsTrigger>
        </TabsList>

        {/* ── 한국 ETF 탭 ────────────────────────────────────────── */}
        <TabsContent value="kr">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">한국 ETF 유니버스</CardTitle>
              <CardDescription className="text-xs">
                Mansfield RS + 모멘텀 계산 대상 종목 · config/tickers_kr_etf.json
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">#</TableHead>
                      <TableHead className="w-24">심볼</TableHead>
                      <TableHead>이름</TableHead>
                      <TableHead className="w-28">카테고리</TableHead>
                      <TableHead className="w-16">거래소</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {krTickers.map((t, i) => (
                      <TableRow key={t.symbol}>
                        {/* 순번 */}
                        <TableCell className="text-xs text-muted-foreground tabular-nums">
                          {i + 1}
                        </TableCell>
                        {/* 심볼 (KRX 6자리 코드) */}
                        <TableCell className="font-mono text-xs font-semibold">
                          {t.symbol}
                        </TableCell>
                        {/* ETF 이름 */}
                        <TableCell className="text-xs">{t.name}</TableCell>
                        {/* 카테고리 — CATEGORY_LABELS로 한국어 변환 */}
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {CATEGORY_LABELS[t.category] ?? t.category}
                          </Badge>
                        </TableCell>
                        {/* 거래소 */}
                        <TableCell className="text-xs text-muted-foreground">
                          {t.exchange}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── 미국 ETF 탭 ────────────────────────────────────────── */}
        <TabsContent value="us">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">미국 ETF 유니버스</CardTitle>
              <CardDescription className="text-xs">
                Mansfield RS + 모멘텀 계산 대상 종목 · config/tickers_us_etf_themes.json
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">#</TableHead>
                      <TableHead className="w-20">심볼</TableHead>
                      <TableHead>이름</TableHead>
                      <TableHead className="w-32">카테고리</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {usTickers.map((t, i) => (
                      <TableRow key={t.symbol}>
                        {/* 순번 */}
                        <TableCell className="text-xs text-muted-foreground tabular-nums">
                          {i + 1}
                        </TableCell>
                        {/* 심볼 (Yahoo Finance 형식) */}
                        <TableCell className="font-mono text-xs font-semibold">
                          {t.symbol}
                        </TableCell>
                        {/* ETF 이름 */}
                        <TableCell className="text-xs">{t.name}</TableCell>
                        {/* 카테고리 */}
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {CATEGORY_LABELS[t.category] ?? t.category}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── 파라미터 탭 ────────────────────────────────────────── */}
        <TabsContent value="params">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* 캐시 설정 */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">캐시 설정</CardTitle>
                <CardDescription className="text-xs">
                  데이터 캐시 유효 시간
                </CardDescription>
              </CardHeader>
              <CardContent>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">히스토리 TTL</dt>
                    <dd className="font-mono font-medium">
                      {params.cache.historicalTTLSeconds / 3600}시간
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">실시간 가격 TTL</dt>
                    <dd className="font-mono font-medium">
                      {params.cache.priceTTLSeconds}초
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">지수 TTL</dt>
                    <dd className="font-mono font-medium">
                      {params.cache.indexTTLSeconds / 60}분
                    </dd>
                  </div>
                </dl>
              </CardContent>
            </Card>

            {/* 모멘텀 설정 */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">모멘텀 설정</CardTitle>
                <CardDescription className="text-xs">
                  변동성 조정 모멘텀 파라미터
                </CardDescription>
              </CardHeader>
              <CardContent>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">계산 기간</dt>
                    <dd className="font-mono font-medium">
                      {params.momentum.periods.join(" / ")}일
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">안정화 윈도우</dt>
                    <dd className="font-mono font-medium">
                      {params.momentum.lookbackDays}일 평균
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Top N</dt>
                    <dd className="font-mono font-medium">
                      {params.momentum.topN}종
                    </dd>
                  </div>
                </dl>
              </CardContent>
            </Card>

            {/* 스크리너 설정 */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">스크리너 설정</CardTitle>
                <CardDescription className="text-xs">
                  복합 필터 기본 파라미터
                </CardDescription>
              </CardHeader>
              <CardContent>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">모멘텀 Top N</dt>
                    <dd className="font-mono font-medium">
                      {params.screener.topN}종
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">MA 계산 최소 기간</dt>
                    <dd className="font-mono font-medium">
                      {params.screener.minHistoryDays}일
                    </dd>
                  </div>
                </dl>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── 백업/복원 탭 ────────────────────────────────────── */}
        <TabsContent value="backup">
          <BackupRestorePanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
