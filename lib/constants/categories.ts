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
  // 미국 ETF 카테고리
  china_tech:     "중국테크",
  battery_ev:     "배터리/EV",
  japan:          "일본",
  ai_software:    "AI/소프트웨어",
  semiconductor:  "반도체",
  defense:        "방산",
  energy:         "에너지",
  resources:      "원자재",
  healthcare:     "헬스케어",
  mobility:       "모빌리티",
  clean_energy:   "클린에너지",
  broad_market:   "광범위",
  dividend:       "배당",
  infrastructure: "인프라",
  consumer:       "소비재",
  innovation:     "혁신",
};
