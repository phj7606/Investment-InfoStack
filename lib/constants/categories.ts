// ETF 카테고리 코드 → 한글 레이블 매핑
// EtfRsTable, ScreenerResultTable 등 여러 컴포넌트에서 공통 사용

export const CATEGORY_LABELS: Record<string, string> = {
  // 한국 ETF 카테고리
  domestic_index: "국내지수",
  sector:         "섹터",
  overseas:       "해외",
  leverage:       "레버리지",
  inverse:        "인버스",
  bond:           "채권",
  commodity:      "원자재",
  theme:          "테마",
  // 미국 ETF 카테고리 — GICS 11섹터 + 테마
  broad_market:   "광범위",
  tech:           "기술",
  semiconductor:  "반도체",
  ai_software:    "AI/소프트웨어",
  healthcare:     "헬스케어",
  financials:     "금융",
  industrials:    "산업재",
  energy:         "에너지",
  materials:      "소재",
  utilities:      "유틸리티",
  real_estate:    "리츠/부동산",
  consumer_disc:  "경기소비재",
  consumer:       "필수소비재",
  comm_services:  "통신서비스",
  defense:        "방산/우주",
  clean_energy:   "클린에너지",
  battery_ev:     "배터리/EV",
  mobility:       "모빌리티",
  resources:      "원자재",
  infrastructure: "인프라",
  dividend:       "배당",
  china_tech:     "중국테크",
  japan:          "일본",
  innovation:     "혁신",
};
