"use client";

// 비밀번호 찾기 페이지 — 이메일로 재설정 링크 발송
// 클라이언트 컴포넌트: 폼 상태 및 제출 이벤트 처리 필요

import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";

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

// zod 스키마 — 이메일 형식만 검증
const forgotPasswordSchema = z.object({
  email: z.string().email("올바른 이메일 주소를 입력해주세요."),
});

type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>;

export default function ForgotPasswordPage() {
  const form = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: {
      email: "",
    },
  });

  const onSubmit = async (values: ForgotPasswordValues) => {
    // 실제 API 연동 시 비밀번호 재설정 이메일 발송 로직으로 교체
    // 현재는 UI 흐름 시연용 mock 처리
    toast.success("이메일을 발송했습니다!", {
      description: `${values.email}으로 비밀번호 재설정 링크를 보냈습니다.`,
    });
  };

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">비밀번호 찾기</CardTitle>
        <CardDescription>
          가입한 이메일 주소를 입력하면 재설정 링크를 보내드립니다.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* 이메일 입력 폼 */}
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
            <Button
              type="submit"
              className="w-full"
              disabled={form.formState.isSubmitting}
            >
              {form.formState.isSubmitting ? "발송 중..." : "재설정 링크 발송"}
            </Button>
          </form>
        </Form>

        {/* 로그인 페이지 복귀 링크 */}
        <p className="text-center text-sm text-muted-foreground">
          비밀번호가 기억나셨나요?{" "}
          <Link
            href="/login"
            className="font-medium text-foreground hover:underline"
          >
            로그인으로 돌아가기
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
