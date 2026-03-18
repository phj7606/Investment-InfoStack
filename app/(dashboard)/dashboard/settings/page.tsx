// 설정 페이지 — 계정 및 서비스 환경설정
// RSC: 설정 폼 구조 표시, 실제 값 변경은 클라이언트 컴포넌트로 분리 예정

import { PageHeader } from "@/components/common/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function SettingsPage() {
  return (
    <div>
      {/* 페이지 헤더: 제목 + 설명 */}
      <PageHeader
        title="설정"
        description="계정 정보, 알림, 보안 등 서비스 환경을 설정하세요."
      />

      <div className="space-y-6">
        {/* 프로필 설정 섹션 */}
        <Card>
          <CardHeader>
            <CardTitle>프로필</CardTitle>
            <CardDescription>이름, 이메일 등 기본 계정 정보를 수정합니다.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* 입력 필드 스켈레톤 — 실제 폼으로 교체 예정 */}
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="space-y-1.5">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-9 w-full rounded-md" />
              </div>
            ))}
            <Skeleton className="h-9 w-24 rounded-md mt-2" />
          </CardContent>
        </Card>

        {/* 알림 설정 섹션 */}
        <Card>
          <CardHeader>
            <CardTitle>알림</CardTitle>
            <CardDescription>이메일 및 푸시 알림 수신 여부를 설정합니다.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* 토글 스켈레톤 목록 */}
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="space-y-1">
                  <Skeleton className="h-3 w-32" />
                  <Skeleton className="h-3 w-48" />
                </div>
                {/* 토글 스위치 플레이스홀더 */}
                <Skeleton className="h-5 w-9 rounded-full" />
              </div>
            ))}
          </CardContent>
        </Card>

        {/* 보안 설정 섹션 */}
        <Card>
          <CardHeader>
            <CardTitle>보안</CardTitle>
            <CardDescription>비밀번호 변경 및 2단계 인증을 관리합니다.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Skeleton className="h-9 w-36 rounded-md" />
            <Skeleton className="h-9 w-40 rounded-md" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
