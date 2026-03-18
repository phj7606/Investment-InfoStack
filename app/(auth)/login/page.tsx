"use client";

// 로그인 페이지 — shadcn Form + react-hook-form + zod 조합
// 클라이언트 컴포넌트: 폼 상태 및 제출 이벤트 처리 필요

import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Github } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";

// zod 스키마 — 유효성 검사 규칙 선언적으로 정의
const loginSchema = z.object({
  email: z.string().email("올바른 이메일 주소를 입력해주세요."),
  password: z.string().min(8, "비밀번호는 최소 8자 이상이어야 합니다."),
});

type LoginValues = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const onSubmit = async (values: LoginValues) => {
    // 실제 API 연동 시 이 부분을 교체
    // 현재는 UI 흐름 시연용 mock 처리
    console.log("로그인 시도:", values.email);
    toast.success("로그인 성공!", {
      description: `${values.email}으로 로그인했습니다.`,
    });
  };

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">로그인</CardTitle>
        <CardDescription>계정에 로그인하세요</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* 소셜 로그인 — 폼 위에 배치하여 더 빠른 경로 제공 */}
        <Button variant="outline" className="w-full" type="button">
          <Github className="mr-2 h-4 w-4" />
          GitHub으로 계속하기
        </Button>

        {/* 구분선: 소셜 vs 이메일 로그인 영역 분리 */}
        <div className="relative">
          <Separator />
          <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-2 text-xs text-muted-foreground">
            또는 이메일로
          </span>
        </div>

        {/* 이메일/비밀번호 폼 */}
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>이메일</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      placeholder="name@example.com"
                      {...field}
                    />
                  </FormControl>
                  {/* FormMessage: zod 유효성 검사 에러 자동 표시 */}
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center justify-between">
                    <FormLabel>비밀번호</FormLabel>
                    <Link
                      href="/forgot-password"
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      비밀번호 찾기
                    </Link>
                  </div>
                  <FormControl>
                    <Input type="password" placeholder="••••••••" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button
              type="submit"
              className="w-full"
              disabled={form.formState.isSubmitting}
            >
              {form.formState.isSubmitting ? "로그인 중..." : "로그인"}
            </Button>
          </form>
        </Form>

        {/* 회원가입 유도 링크 */}
        <p className="text-center text-sm text-muted-foreground">
          계정이 없으신가요?{" "}
          <Link
            href="/register"
            className="font-medium text-foreground hover:underline"
          >
            회원가입
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
