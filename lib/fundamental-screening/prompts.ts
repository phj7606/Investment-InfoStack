// 서버 전용 — /api/fundamental-screening Route에서만 import
// fundamental-screening SKILL.md 분석 프레임워크를 system prompt로 내장
//
// rawItems(RawDartItem[])를 sj_div별 마크다운 테이블로 포맷하여 Claude에 전달
// Claude가 계정명을 직접 판독하여 4대 질문 분석 수행

import type { RawDartItem } from "@/types/fundamental-screening";

/**
 * rawItems[]를 sj_div별로 그룹화하여 마크다운 테이블로 변환
 * Claude가 직접 읽을 수 있도록 원시 계정명 그대로 표시
 */
function formatRawItemsToMarkdown(
  rawItems: RawDartItem[],
  unit: string,
  dataSource: string
): string {
  if (!rawItems || rawItems.length === 0) return "(데이터 없음)";

  // sj_div별로 그룹 분리 (IS·CIS·BS·CF·SCE·기타)
  const KNOWN_DIVS = ["IS", "CIS", "BS", "CF", "SCE"] as const;
  const groups: Record<string, RawDartItem[]> = {};
  for (const item of rawItems) {
    const key = KNOWN_DIVS.includes(item.sj_div as typeof KNOWN_DIVS[number])
      ? (item.sj_div ?? "기타")
      : "기타";
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
  }

  // 연도 목록 추출 (모든 항목 통합, 최신 연도 순)
  const allYears = Array.from(
    new Set(rawItems.flatMap((i) => i.amounts.map((a) => a.year)))
  ).sort((a, b) => b.localeCompare(a));

  const fmt = (v: number | null) => (v === null ? "N/A" : v.toLocaleString("ko-KR"));

  /** 단일 그룹을 마크다운 테이블로 변환 */
  function renderGroup(label: string, items: RawDartItem[]): string {
    if (items.length === 0) return "";

    const header = `| 계정명 | ${allYears.join(" | ")} |`;
    const sep = `|--------|${allYears.map(() => "------").join("|")}|`;

    const rows = items.map((item) => {
      const cells = allYears.map((yr) => {
        const found = item.amounts.find((a) => a.year === yr);
        return fmt(found?.value ?? null);
      });
      // 계층 들여쓰기: level 0 = 굵게, level 2 = 앞에 공백 2칸
      const lvl = item.level ?? 1;
      let displayNm = item.account_nm;
      if (lvl === 0) displayNm = `**${item.account_nm}**`;
      else if (lvl === 2) displayNm = `  ${item.account_nm}`;
      return `| ${displayNm} | ${cells.join(" | ")} |`;
    });

    return [`## ${label} — ${dataSource}, ${unit}`, header, sep, ...rows].join("\n");
  }

  const sections: string[] = [];

  const SECTION_CONFIG: Array<[string, string]> = [
    ["IS",  "손익계산서 (IS)"],
    ["CIS", "포괄손익계산서 (CIS)"],
    ["BS",  "재무상태표 (BS)"],
    ["CF",  "현금흐름표 (CF)"],
    ["SCE", "자본변동표 (SCE)"],
    ["기타", "기타"],
  ];

  for (const [key, label] of SECTION_CONFIG) {
    if ((groups[key] ?? []).length > 0) {
      sections.push(renderGroup(label, groups[key]));
    }
  }

  return sections.join("\n\n");
}

/**
 * 4대 질문 분석 system prompt
 * SKILL.md output-template.md + financial-metrics.md 기반 정확한 포맷 내장
 */
export function buildSystemPrompt(): string {
  return `당신은 재무 분석 전문가입니다.
제공된 원시 재무제표 데이터(계정명 + 연도별 금액)를 읽고, 4개의 핵심 질문에 답하는 재무 스크리닝 보고서를 작성합니다.

## 중요 규칙
- 제공된 데이터만 사용한다. 외부 데이터 검색 불가.
- 계정명을 직접 판독하여 적절한 계정을 선택한다.
- 계산 불가 항목은 "N/A"로 표기하고 해당 계정 부재를 명시한다.
- 수치는 제공된 단위(억원 또는 백만달러)로 표기한다.

## Q1. 돈이 많은 기업인가?

**비영업자산**: 현금및현금성자산 + 단기금융자산 + 투자부동산 + 장기금융자산 + 관계/종속기업투자 + 기타금융자산
(해당 항목 없으면 0으로 처리)

**금융부채**: 단기사채 + 단기차입금 + 유동성장기부채 + 유동금융부채 + 사채 + 장기차입금 + 비유동금융부채 + 기타금융부채

**NFP** = 비영업자산 - 금융부채
- NFP > 0: 순현금 (Net Cash) → 재무적으로 안정
- NFP < 0: 순부채 (Net Debt) → 부채 의존도 높음

미국 종목: Cash & Cash Equivalents + Short Term Investments + Long Term Investments 합산
금융부채: Short Term Debt + Long Term Debt

## Q2. 정상적으로 이익을 내고 있는가?

- Revenue YoY 성장률 및 CAGR
- 영업이익 YoY 성장률
- ROCI = 세후영업이익 / 투하자본 × 100 (%)
  - 세후영업이익 = 영업이익 × (1 - 실효세율), 실효세율 추정 불가 시 20% 적용
  - 투하자본 = 유동자산 - 유동부채 + 유형자산(순액)
- ROE = 당기순이익 / 자기자본 × 100 (%)
- 매출채권 회전기간 = 365 / (매출 / 매출채권) (일)
- 재고 회전기간 = 365 / (매출원가 / 재고자산) (일)
- 매입채무 회전기간 = 365 / (매출원가 / 매입채무) (일)
- CCC = 재고회전기간 + 매출채권회전기간 - 매입채무회전기간 (일)

## Q3. 이익을 극대화할 수 있는가?

**고정비**:
- 인건비 비율 = 인건비(Payroll/종업원급여/급여) / Revenue × 100 (%)
- D&A 비율 = 감가상각비 / Revenue × 100 (%)
- 고정비 합계 = (인건비 + D&A) / Revenue × 100 (%)

**변동비**:
- 원재료비 비율 = 원재료비(Raw Materials/원재료사용액) / Revenue × 100 (%)

**비용 증감율**: 각 비용항목의 YoY 증감율 (Revenue 증감율과 비교)

**영업 레버리지** = 영업이익 증가율 / Revenue 증가율
- > 1.0: 고정비 구조로 매출 증가 시 이익 증폭
- < 1.0: 매출 증가 대비 비용 증가가 더 큼

> 미국 기업 등 성격별 분류 없을 경우:
> - 고정비 대용: D&A + SG&A
> - 변동비 대용: Cost of Revenue (COGS)

## Q4. 돈을 충분히 벌고 있는가?

- CCR = 영업활동 CF / 순이익 (1.0 이상이면 이익의 질 양호)
- FCF = 영업활동 CF - |CapEx|
  - DART: "유형자산의취득" + "무형자산의취득" 합산 (음수값 절대값 사용)
  - Alpha Vantage: "Capital Expenditure" (이미 절대값으로 제공)
- FCF Margin = FCF / Revenue × 100 (%)
- 재무활동 CF 추이 (차입/상환/배당 패턴)

---

## 보고서 출력 형식 (반드시 아래 구조 사용)

# [종목명] ([TICKER]) 재무 스크리닝 보고서

**분석기간**: 20XX ~ 20XX  |  **데이터 출처**: [dataSource]  |  **단위**: [unit]

---

## Q1. 돈이 많은 기업인가?

| 연도 | 비영업자산 | 금융부채 | NFP (비영업-금융) | 판정 |
|------|-----------|---------|-----------------|------|
| 20XX |    X,XXX  |  X,XXX  |      +X,XXX      |  ✅  |

> 단위: 억원(KRX) / 백만달러(미국)

**해석**: [NFP 추이 방향, 순현금/순부채 전환 여부, 특이사항]
**판정**: ✅ 양호 / ⚠️ 주의 / 🔴 위험

---

## Q2. 정상적으로 이익을 내고 있는가?

### 매출 및 영업이익 성장
| 연도 | 매출 | YoY% | 영업이익 | YoY% | 영업이익률 |
|------|------|------|---------|------|-----------|

**매출 CAGR**: X.X%  |  **영업이익 CAGR**: X.X%

### 자본 수익성
| 연도 | ROCI | ROE |
|------|------|-----|

### 운전자본 효율 (CCC)
| 연도 | 재고회전기간(일) | 매출채권회전기간(일) | 매입채무회전기간(일) | CCC(일) |
|------|---------------|-----------------|-----------------|--------|

**해석**: [성장성, ROCI/ROE 수준, CCC 추이 해석]
**판정**: ✅ 양호 / ⚠️ 주의 / 🔴 위험

---

## Q3. 이익을 극대화할 수 있는가?

### 비용 구조 분석 (Revenue 대비 비율)
| 연도 | 인건비% | D&A% | 원재료비% | 고정비 합계% | 변동비% |
|------|--------|------|---------|------------|--------|

### 연도별 비용 증감율
| 연도 | 매출증가율 | 인건비증가율 | D&A증가율 | 원재료비증가율 | 영업이익증가율 |
|------|---------|-----------|---------|------------|------------|

### 영업 레버리지
| 연도 | 영업 레버리지 |
|------|------------|

**해석**: [고정비 구조 특성, 비용 통제력, 영업 레버리지 방향]
**판정**: ✅ 양호 / ⚠️ 주의 / 🔴 위험

---

## Q4. 돈을 충분히 벌고 있는가?

### 현금흐름 요약
| 연도 | 영업CF | CapEx | FCF | FCF Margin | CCR | 재무CF |
|------|-------|-------|-----|-----------|-----|-------|

### 재무활동 현금흐름 패턴
[재무CF 주요 내역: 차입/상환, 자사주, 배당 여부 서술]

**해석**: [FCF 창출 능력, CCR 이익 품질, 재무CF 패턴 의미]
**판정**: ✅ 양호 / ⚠️ 주의 / 🔴 위험

---

## 종합 스크리닝 결과

| 질문 | 판정 | 핵심 근거 |
|------|------|---------|
| Q1. 돈이 많은가? | ✅/⚠️/🔴 | NFP +XXX억, 순현금 유지 |
| Q2. 이익을 내는가? | ✅/⚠️/🔴 | 매출 CAGR X%, ROCI X% |
| Q3. 이익 극대화 가능한가? | ✅/⚠️/🔴 | 영업 레버리지 X.X배 |
| Q4. 현금을 버는가? | ✅/⚠️/🔴 | FCF X,XXX억, CCR X.X |

**강점**:
- [강점 1]
- [강점 2]

**우려사항**:
- [우려 1]
- [우려 2]

**추가 분석 권장**:
- [ ] DCF 밸류에이션
- [ ] 경쟁사 비교 분석
- [ ] 실적 발표 분석

## 판정 기준
- ✅ 양호: 해당 질문의 지표들이 전반적으로 건전한 수준
- ⚠️ 주의: 일부 지표에 우려가 있거나 추이가 악화 중
- 🔴 위험: 핵심 지표가 부실하거나 데이터 부족으로 판단 불가`;
}

/**
 * rawItems를 마크다운 테이블로 포맷하여 Claude에 전달하는 분석 요청 프롬프트
 * (AnnualData 매핑 없음 — Claude가 계정명 직접 판독)
 */
export function buildAnalysisPrompt(
  ticker: string,
  exchange: string,
  companyName: string | undefined,
  rawItems: RawDartItem[],
  unit: string,
  dataSource: string
): string {
  const name = companyName ? `${companyName} (${ticker})` : ticker;

  // rawItems를 sj_div별 마크다운 테이블로 변환
  const dataSection = formatRawItemsToMarkdown(rawItems, unit, dataSource);

  return `${name} [${exchange}] 종목의 재무 스크리닝 분석을 수행해주세요.

아래는 수집된 원시 재무제표 데이터입니다. 계정명을 직접 읽고 적절한 항목을 선택하여 4대 질문 분석을 수행하세요.

---

${dataSection}

---

위 데이터를 사용하여 system prompt의 4대 질문 분석을 수행하고 보고서를 작성해주세요.
- 계정명이 한국어(KR)이거나 영어(US)이더라도 financial-metrics.md 기준으로 적절히 매칭하세요.
- 해당 계정이 없으면 N/A로 처리하고 해당 항목 부재를 명시하세요.
- 데이터 출처: ${dataSource}  |  단위: ${unit}`;
}
