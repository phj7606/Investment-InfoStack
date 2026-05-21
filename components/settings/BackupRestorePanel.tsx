"use client";

/**
 * 백업/복원 패널
 *
 * 전체 통합 백업: 5개 모듈 데이터를 단일 JSON 파일로 다운로드
 * 전체 복원: 통합 백업 파일에서 선택한 모듈만 복원
 * 모듈별 개별 백업/복원: 각 모듈 독립 백업 파일 사용
 */

import { useState, useRef } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Download, Upload, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";

// ─────────────────────────────────────────
// 모듈 정의
// ─────────────────────────────────────────

type ModuleKey = "financial" | "pension" | "longterm" | "education" | "shortterm" | "monthly-cf" | "pension-rebalancing" | "performance";

interface ModuleMeta {
  key: ModuleKey;
  label: string;
  description: string;
  backupEndpoint: string;
}

const MODULES: ModuleMeta[] = [
  {
    key: "financial",
    label: "재무현황",
    description: "월별 재무 스냅샷 (DRAFT/CONFIRMED)",
    backupEndpoint: "/api/portfolio/financial/backup",
  },
  {
    key: "pension",
    label: "연금",
    description: "퇴직연금·연금저축·IRP 거래내역",
    backupEndpoint: "/api/portfolio/pension/backup",
  },
  {
    key: "longterm",
    label: "중장기",
    description: "가치투자 계좌 거래내역",
    backupEndpoint: "/api/portfolio/longterm/backup",
  },
  {
    key: "education",
    label: "교육계좌 (1470)",
    description: "교육 계좌 포지션·거래 내역",
    backupEndpoint: "/api/portfolio/education/backup",
  },
  {
    key: "shortterm",
    label: "단기계좌 (2805)",
    description: "단기 계좌 포지션·거래 내역",
    backupEndpoint: "/api/portfolio/shortterm/backup",
  },
  {
    key: "monthly-cf",
    label: "월별 현금흐름",
    description: "월별 수입·지출 항목 및 계좌 잔액",
    backupEndpoint: "/api/portfolio/financial/monthly-cf/backup",
  },
  {
    key: "pension-rebalancing",
    label: "연금 리밸런싱 설정",
    description: "리밸런싱 목표 비중 설정 (채권·주식 비율)",
    backupEndpoint: "/api/portfolio/pension/rebalancing/backup",
  },
  {
    key: "performance",
    label: "성과 기준 데이터",
    description: "Jan-Apr 2026 성과 부트스트랩 + 기준선",
    backupEndpoint: "/api/portfolio/performance/backup",
  },
];

// ─────────────────────────────────────────
// 상태 표시 배지
// ─────────────────────────────────────────

type OpStatus = "idle" | "loading" | "success" | "error";

interface StatusMessage {
  status: OpStatus;
  text: string;
}

function StatusBadge({ status, text }: StatusMessage) {
  if (status === "idle") return null;
  if (status === "loading") {
    return (
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        {text}
      </span>
    );
  }
  if (status === "success") {
    return (
      <span className="flex items-center gap-1 text-xs text-emerald-600">
        <CheckCircle2 className="h-3 w-3" />
        {text}
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-xs text-rose-500">
      <AlertCircle className="h-3 w-3" />
      {text}
    </span>
  );
}

// ─────────────────────────────────────────
// 전체 백업 섹션
// ─────────────────────────────────────────

function FullBackupSection() {
  const [downloadStatus, setDownloadStatus] = useState<StatusMessage>({ status: "idle", text: "" });
  const [restoreStatus, setRestoreStatus] = useState<StatusMessage>({ status: "idle", text: "" });
  const [restoreMode, setRestoreMode] = useState<"overwrite" | "merge">("overwrite");
  const [selectedModules, setSelectedModules] = useState<Set<ModuleKey>>(
    new Set(MODULES.map((m) => m.key))
  );
  const fileRef = useRef<HTMLInputElement>(null);

  // 전체 백업 다운로드
  const handleFullDownload = async () => {
    setDownloadStatus({ status: "loading", text: "백업 생성 중..." });
    try {
      const res = await fetch("/api/backup/full");
      if (!res.ok) throw new Error("서버 오류");
      const blob = await res.blob();
      const today = new Date().toISOString().slice(0, 10);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `investment-backup-${today}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setDownloadStatus({ status: "success", text: "다운로드 완료" });
    } catch {
      setDownloadStatus({ status: "error", text: "백업 실패" });
    }
    setTimeout(() => setDownloadStatus({ status: "idle", text: "" }), 3000);
  };

  // 모듈 선택 토글
  const toggleModule = (key: ModuleKey) => {
    setSelectedModules((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  // 전체 복원
  const handleFullRestore = async (file: File) => {
    setRestoreStatus({ status: "loading", text: "파일 읽는 중..." });
    try {
      const text = await file.text();
      const data = JSON.parse(text);

      if (data.version !== 2) {
        setRestoreStatus({ status: "error", text: "지원하지 않는 백업 형식입니다" });
        return;
      }

      setRestoreStatus({ status: "loading", text: "복원 중..." });
      const res = await fetch("/api/backup/full", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          data,
          modules: Array.from(selectedModules),
          mode: restoreMode,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "복원 실패");
      }

      const result = await res.json();
      // 복원 결과 요약 텍스트 생성
      const summary = Object.entries(result.results as Record<string, { restored: number; skipped: number }>)
        .map(([k, v]) => `${k}: +${v.restored}`)
        .join(", ");
      setRestoreStatus({ status: "success", text: `복원 완료 (${summary})` });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "복원 실패";
      setRestoreStatus({ status: "error", text: msg });
    }
    if (fileRef.current) fileRef.current.value = "";
    setTimeout(() => setRestoreStatus({ status: "idle", text: "" }), 5000);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          전체 통합 백업
          <Badge variant="secondary" className="text-xs">추천</Badge>
        </CardTitle>
        <CardDescription className="text-xs">
          5개 모듈(재무·연금·중장기·교육·단기) 데이터를 하나의 JSON 파일로 백업/복원합니다.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* 다운로드 */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">전체 백업 다운로드</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              investment-backup-YYYY-MM-DD.json
            </p>
          </div>
          <div className="flex items-center gap-3">
            <StatusBadge {...downloadStatus} />
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={handleFullDownload}
              disabled={downloadStatus.status === "loading"}
            >
              <Download className="h-3.5 w-3.5" />
              백업 다운로드
            </Button>
          </div>
        </div>

        {/* 구분선 */}
        <div className="border-t border-border" />

        {/* 복원 */}
        <div className="space-y-3">
          <p className="text-sm font-medium">전체 복원</p>

          {/* 모듈 선택 체크박스 */}
          <div>
            <p className="text-xs text-muted-foreground mb-2">복원할 모듈 선택</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {MODULES.map((m) => (
                <div key={m.key} className="flex items-center gap-2">
                  <Checkbox
                    id={`full-${m.key}`}
                    checked={selectedModules.has(m.key)}
                    onCheckedChange={() => toggleModule(m.key)}
                  />
                  <Label htmlFor={`full-${m.key}`} className="text-xs cursor-pointer">
                    {m.label}
                  </Label>
                </div>
              ))}
            </div>
          </div>

          {/* 복원 모드 + 파일 업로드 */}
          <div className="flex flex-wrap items-center gap-3">
            <Select
              value={restoreMode}
              onValueChange={(v) => setRestoreMode(v as "overwrite" | "merge")}
            >
              <SelectTrigger className="h-8 w-36 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="overwrite" className="text-xs">덮어쓰기</SelectItem>
                <SelectItem value="merge" className="text-xs">병합 (중복 제외)</SelectItem>
              </SelectContent>
            </Select>

            <input
              ref={fileRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFullRestore(f);
              }}
            />
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => fileRef.current?.click()}
              disabled={restoreStatus.status === "loading" || selectedModules.size === 0}
            >
              <Upload className="h-3.5 w-3.5" />
              파일 선택 후 복원
            </Button>

            <StatusBadge {...restoreStatus} />
          </div>

          {/* 덮어쓰기 경고 */}
          {restoreMode === "overwrite" && (
            <p className="text-xs text-amber-600 bg-amber-500/10 rounded px-2 py-1">
              덮어쓰기 모드: 선택한 모듈의 기존 데이터가 완전히 교체됩니다.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────
// 모듈별 개별 백업/복원 카드
// ─────────────────────────────────────────

function ModuleBackupCard({ module }: { module: ModuleMeta }) {
  const [downloadStatus, setDownloadStatus] = useState<StatusMessage>({ status: "idle", text: "" });
  const [restoreStatus, setRestoreStatus] = useState<StatusMessage>({ status: "idle", text: "" });
  const [restoreMode, setRestoreMode] = useState<"overwrite" | "merge">("merge");
  const fileRef = useRef<HTMLInputElement>(null);

  // 모듈 개별 백업 다운로드
  const handleDownload = async () => {
    setDownloadStatus({ status: "loading", text: "생성 중..." });
    try {
      const res = await fetch(module.backupEndpoint);
      if (!res.ok) throw new Error("서버 오류");
      const blob = await res.blob();
      // Content-Disposition 헤더에서 파일명 추출
      const cd = res.headers.get("Content-Disposition") ?? "";
      const match = cd.match(/filename="([^"]+)"/);
      const filename = match?.[1] ?? `${module.key}-backup.json`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      setDownloadStatus({ status: "success", text: "완료" });
    } catch {
      setDownloadStatus({ status: "error", text: "실패" });
    }
    setTimeout(() => setDownloadStatus({ status: "idle", text: "" }), 2000);
  };

  // 모듈 개별 복원
  const handleRestore = async (file: File) => {
    setRestoreStatus({ status: "loading", text: "복원 중..." });
    try {
      const text = await file.text();
      const data = JSON.parse(text);

      // 각 모듈별 POST 본문 구성 — 백업 파일 구조에 맞게 변환
      const body = buildRestoreBody(module.key, data, restoreMode);

      const res = await fetch(module.backupEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "복원 실패");
      }

      const result = await res.json();
      // 응답 구조가 모듈마다 다르므로 통합 요약
      const restored = result.restored ?? (result.restoredPositions ?? 0) + (result.restoredTrades ?? 0);
      const skipped = result.skipped ?? (result.skippedPositions ?? 0) + (result.skippedTrades ?? 0);
      setRestoreStatus({ status: "success", text: `복원 ${restored}건 (건너뜀 ${skipped}건)` });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "복원 실패";
      setRestoreStatus({ status: "error", text: msg });
    }
    if (fileRef.current) fileRef.current.value = "";
    setTimeout(() => setRestoreStatus({ status: "idle", text: "" }), 4000);
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">{module.label}</CardTitle>
        <CardDescription className="text-xs">{module.description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-center gap-2">
          {/* 다운로드 */}
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs gap-1"
            onClick={handleDownload}
            disabled={downloadStatus.status === "loading"}
          >
            <Download className="h-3 w-3" />
            백업
          </Button>

          {/* 복원 모드 선택 */}
          <Select
            value={restoreMode}
            onValueChange={(v) => setRestoreMode(v as "overwrite" | "merge")}
          >
            <SelectTrigger className="h-7 w-32 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="merge" className="text-xs">병합</SelectItem>
              <SelectItem value="overwrite" className="text-xs">덮어쓰기</SelectItem>
            </SelectContent>
          </Select>

          {/* 복원 파일 업로드 */}
          <input
            ref={fileRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleRestore(f);
            }}
          />
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs gap-1"
            onClick={() => fileRef.current?.click()}
            disabled={restoreStatus.status === "loading"}
          >
            <Upload className="h-3 w-3" />
            복원
          </Button>

          {/* 상태 표시 */}
          <div className="flex items-center gap-2 ml-1">
            <StatusBadge {...downloadStatus} />
            <StatusBadge {...restoreStatus} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────
// 모듈별 복원 본문 구성 헬퍼
// ─────────────────────────────────────────

function buildRestoreBody(
  moduleKey: ModuleKey,
  data: Record<string, unknown>,
  mode: "overwrite" | "merge"
) {
  switch (moduleKey) {
    case "financial":
      return { snapshots: data.snapshots, mode };
    case "pension":
      return { transactions: data.transactions, mode };
    case "longterm":
      return { transactions: data.transactions, mode };
    case "education":
    case "shortterm":
      return { positions: data.positions, trades: data.trades, mode };
    case "monthly-cf":
      return { entries: data.entries, balances: data.balances, mode };
    case "pension-rebalancing":
      // 단일 config 객체 — merge 개념 없이 항상 overwrite
      return { config: data.config, mode: "overwrite" as const };
    case "performance":
      // bootstrap·baseline 파일 — merge 개념 없이 항상 overwrite
      return { bootstrap: data.bootstrap, baseline: data.baseline, mode: "overwrite" as const };
  }
}

// ─────────────────────────────────────────
// 메인 패널 컴포넌트
// ─────────────────────────────────────────

export function BackupRestorePanel() {
  return (
    <div className="space-y-6">
      {/* 전체 통합 백업/복원 */}
      <FullBackupSection />

      {/* 모듈별 개별 백업/복원 */}
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          모듈별 개별 백업/복원
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {MODULES.map((m) => (
            <ModuleBackupCard key={m.key} module={m} />
          ))}
        </div>
      </div>
    </div>
  );
}
