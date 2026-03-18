// 프로젝트 전반에서 재사용되는 공통 타입 정의

export interface NavItem {
  title: string;
  href: string;
  // 사이드바/모바일 메뉴에서 활성 상태 아이콘 표시용
  icon?: React.ComponentType<{ className?: string }>;
  disabled?: boolean;
  external?: boolean;
}

export interface SiteConfig {
  name: string;
  description: string;
  url: string;
  ogImage: string;
  links: {
    twitter?: string;
    github?: string;
  };
}

export interface StatsCardData {
  title: string;
  value: string | number;
  // 이전 기간 대비 변화율 (양수: 증가, 음수: 감소)
  trend?: {
    value: number;
    isPositive: boolean;
  };
  icon?: React.ComponentType<{ className?: string }>;
  description?: string;
}

export interface Feature {
  title: string;
  description: string;
  icon?: React.ComponentType<{ className?: string }>;
}
