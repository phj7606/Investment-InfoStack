// 페이지 상단 제목 + 설명 + 선택적 액션 버튼 영역
// RSC: 상태 불필요, 서버에서 렌더링하여 초기 로드 성능 향상

interface PageHeaderProps {
  title: string;
  description?: string;
  // 우측에 배치할 버튼 등 액션 컴포넌트 (예: "새로 만들기" 버튼)
  action?: React.ReactNode;
}

export function PageHeader({ title, description, action }: PageHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-4 mb-6">
      {/* 좌측: 제목과 설명 */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {description && (
          <p className="text-muted-foreground mt-1">{description}</p>
        )}
      </div>
      {/* 우측: 선택적 액션 버튼 영역 */}
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
