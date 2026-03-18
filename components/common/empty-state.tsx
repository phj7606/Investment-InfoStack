// 빈 상태(Empty State) UI — 데이터가 없을 때 사용자 혼란 방지
// RSC: 정적 표시 컴포넌트

import { InboxIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

interface EmptyStateProps {
  title: string;
  description?: string;
  // CTA 버튼: 데이터 생성이나 다른 행동 유도 시 사용
  action?: {
    label: string;
    onClick?: () => void;
    href?: string;
  };
  // 기본 아이콘 대신 커스텀 아이콘 사용 가능
  icon?: React.ReactNode;
}

export function EmptyState({
  title,
  description,
  action,
  icon,
}: EmptyStateProps) {
  return (
    // 화면 중앙 정렬 — flex 컨테이너 내에서 자연스럽게 중앙 배치
    <div className="flex flex-col items-center justify-center py-16 text-center">
      {/* 아이콘 영역: 시각적으로 빈 상태임을 즉각 전달 */}
      <div className="rounded-full bg-muted p-4 mb-4">
        {icon ?? <InboxIcon className="h-8 w-8 text-muted-foreground" />}
      </div>
      <h3 className="text-lg font-semibold">{title}</h3>
      {description && (
        <p className="text-muted-foreground mt-2 max-w-sm">{description}</p>
      )}
      {/* CTA 버튼: 빈 상태에서 사용자가 취할 수 있는 다음 행동 안내 */}
      {action && (
        <Button className="mt-6" asChild={!!action.href}>
          {action.href ? (
            <a href={action.href}>{action.label}</a>
          ) : (
            <span onClick={action.onClick}>{action.label}</span>
          )}
        </Button>
      )}
    </div>
  );
}
