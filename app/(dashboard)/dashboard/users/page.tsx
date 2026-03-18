// 사용자 관리 페이지 — 가입 사용자 목록 및 권한 관리
// RSC: 사용자 목록 조회 중심, 클라이언트 상태 불필요

import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function UsersPage() {
  return (
    <div>
      {/* 페이지 헤더: 제목 + 사용자 초대 액션 버튼 */}
      <PageHeader
        title="사용자"
        description="서비스에 가입한 사용자를 관리하고 권한을 설정하세요."
        action={<Button size="sm">사용자 초대</Button>}
      />

      {/* 사용자 목록 테이블 카드 */}
      <Card>
        <CardHeader>
          <CardTitle>전체 사용자</CardTitle>
          <CardDescription>등록된 사용자 목록 — 실제 환경에서는 API 연동</CardDescription>
        </CardHeader>
        <CardContent>
          {/* 테이블 헤더 스켈레톤 */}
          <div className="flex items-center gap-4 pb-3 border-b mb-3">
            <Skeleton className="h-3 w-8" />
            <Skeleton className="h-3 flex-1" />
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-3 w-16" />
          </div>

          {/* 사용자 행 스켈레톤 목록 — 실제 데이터 로딩 시 표시 */}
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 py-3 border-b last:border-0">
              {/* 아바타 */}
              <Skeleton className="h-8 w-8 rounded-full shrink-0" />
              {/* 이름/이메일 */}
              <div className="flex-1 space-y-1">
                <Skeleton className="h-3 w-32" />
                <Skeleton className="h-3 w-44" />
              </div>
              {/* 역할 배지 */}
              <Skeleton className="h-5 w-16 rounded-full" />
              {/* 가입일 */}
              <Skeleton className="h-3 w-20" />
              {/* 액션 버튼 */}
              <Skeleton className="h-7 w-7 rounded" />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
