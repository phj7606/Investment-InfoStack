-- Investment-InfoStack Supabase 스키마
-- Supabase 대시보드 → SQL Editor에서 실행

-- 앱 전체 데이터를 저장하는 단일 테이블
-- key: 데이터 종류 식별자 (예: 'longterm_transactions', 'monthly_cf' 등)
-- data: JSONB 형태의 실제 데이터 (배열 또는 오브젝트)
CREATE TABLE IF NOT EXISTS app_data (
  key        TEXT PRIMARY KEY,
  data       JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 데이터 업데이트 시 updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER app_data_updated_at
  BEFORE UPDATE ON app_data
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ── 사용되는 key 목록 ────────────────────────────────────────
-- longterm_transactions  : LongtermTransaction[]
-- pension_transactions   : PensionTransaction[]
-- pension_rebalancing    : PensionRebalancingConfig
-- shortterm_account      : EducationAccountData (positions + trades)
-- education_account      : EducationAccountData (positions + trades)
-- monthly_cf             : MonthlyCFEntry[]
-- monthly_cf_balance     : MonthlyCFBalance  ({ "YYYY-MM": number })
-- financial_snapshots    : FinancialSnapshot[]
-- notion_api_key         : string
-- ─────────────────────────────────────────────────────────────
