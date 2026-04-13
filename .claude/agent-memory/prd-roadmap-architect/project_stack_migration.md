---
name: 기술스택 전환 이력 (Python → Next.js)
description: 초기 Python+Streamlit 스택에서 Next.js+TypeScript 스택으로 전환한 결정 사항
type: project
---

투자 분석 플랫폼은 초기 PRD/ROADMAP이 Python+Streamlit 기반으로 작성되었으나, 실제 구현은 Next.js 15 (App Router) + TypeScript 스택으로 진행하기로 결정되었다.

**Why:** Next.js 스타터킷으로 프로젝트가 이미 초기화되어 있었고, shadcn/ui + recharts + Tailwind CSS 생태계 활용 및 Vercel 배포 최적화를 위해 전환.

**How to apply:**
- PRD/ROADMAP 문서에서 Python 라이브러리(pykrx, yfinance, pandas, Streamlit, Plotly 등) 언급을 발견하면 Next.js 대응 방식으로 제안할 것
- 데이터 수집: `fetchers/*.py` → `app/api/` (Next.js API Routes)
- 지표 계산: `indicators/*.py` → `lib/indicators/*.ts`
- 시각화: Plotly/matplotlib → recharts (`components/charts/`)
- 저장: Parquet → JSON 파일 캐시 (`data/cache/`, `data/indicators/`)
- 스케줄링: APScheduler → GitHub Actions cron / Vercel Cron Jobs
- 배포: Streamlit Cloud → Vercel

전환 시점: 2026.03.27 (PRD v1.1, ROADMAP v1.1)
