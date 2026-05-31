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

### 구현 완료 기준 (IMPORTANT)

**데이터 수집/API 기능 구현 시**
- 관련 store/data 파일(`lib/portfolio/`) 전수 확인 후 누락된 계좌/데이터소스 없는지 검증
- 구현 전 체크: `grep -r "readTransactions\|readPositions" lib/portfolio/` 등으로 모든 소스 파악
- 완료 선언 전 반드시 `curl http://localhost:3000/api/...` 실제 응답 확인

**편집 시**
- 한국어 포함 문자열 교체는 python3 스크립트 사용 (Edit 도구 인코딩 오류 방지)

**이 프로젝트의 계좌 목록 (누락 금지)**
- `longterm` — `lib/portfolio/longterm-store.ts`
- `education` — `lib/portfolio/educationTransactionsData.ts`
- `pension` — `lib/portfolio/pension-store.ts`
- `shortterm` — `lib/portfolio/shorttermData.ts`
- 새 계좌 추가 시 이 목록 갱신 필수