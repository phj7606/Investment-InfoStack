# CLAUDE.md

1인 투자 리서치 플랫폼. Claude API 기반 AI 분석 보고서 + 금융 데이터 연동.

**ACTION 1 퍼널:** 시장 환경(선행) → [1] 섹터 조감 → [2] 종목 분석 → [3] 체크포인트 → [4] 매수 결정

## 명령어

```bash
npm run dev      # 개발 서버 (포트 3000)
npm run build    # 프로덕션 빌드 + 타입 검사
npx tsc --noEmit # 타입 검사만
```

## 핵심 규칙

### 금융 데이터 수집 우선순위

1. **MCP 우선** — `mcp__yfinance__*`, `mcp__korea-stock-mcp__*`, `mcp__financial-datasets__*` 등 사용 가능한 MCP가 있으면 최우선 사용
2. **공식 API Fetcher** — `lib/fetchers/` 의 fetcher 함수 (KRX, FRED, ECOS, Alpha Vantage 등)
3. **web_search** — MCP와 공식 API로 불가한 경우에만

### 스킬 및 플러그인 준수

스킬(`.claude/plugins/`)을 참조하는 기능 구현 시:

- **스킬 파일을 전부 읽는다** — `SKILL.md` + `references/` 하위 모든 문서
- **워크플로우 순서를 절대 변경하지 않는다** — Phase/Step 순서 그대로 system prompt에 반영
- **임의 해석·재구성 금지** — 스킬이 정의한 대로만 구현

### recharts 클라이언트 격리

recharts는 반드시 `"use client"` 컴포넌트로 분리한다. React 19 RSC에서 직접 사용하면 호환성 오류 발생.