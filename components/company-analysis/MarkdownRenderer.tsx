"use client";

// Markdown 렌더러 — react-markdown v8 + remark-gfm 래퍼
// Tailwind Typography 미설치이므로 components prop으로 각 요소 직접 스타일링

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

export function MarkdownRenderer({ content, className }: MarkdownRendererProps) {
  return (
    <div className={cn("text-sm leading-relaxed", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={
          {
            // 헤딩
            h1: ({ children }: { children?: React.ReactNode }) => (
              <h1 className="text-xl font-bold mt-6 mb-3 text-foreground">{children}</h1>
            ),
            h2: ({ children }: { children?: React.ReactNode }) => (
              <h2 className="text-lg font-bold mt-5 mb-2 border-b border-border pb-1 text-foreground">
                {children}
              </h2>
            ),
            h3: ({ children }: { children?: React.ReactNode }) => (
              <h3 className="text-base font-semibold mt-4 mb-2 text-foreground">{children}</h3>
            ),
            h4: ({ children }: { children?: React.ReactNode }) => (
              <h4 className="text-sm font-semibold mt-3 mb-1 text-foreground">{children}</h4>
            ),
            // 단락
            p: ({ children }: { children?: React.ReactNode }) => (
              <p className="mb-3 text-foreground/90 leading-relaxed">{children}</p>
            ),
            // 리스트
            ul: ({ children }: { children?: React.ReactNode }) => (
              <ul className="mb-3 pl-5 space-y-1 list-disc text-foreground/90">{children}</ul>
            ),
            ol: ({ children }: { children?: React.ReactNode }) => (
              <ol className="mb-3 pl-5 space-y-1 list-decimal text-foreground/90">{children}</ol>
            ),
            li: ({ children }: { children?: React.ReactNode }) => (
              <li className="leading-relaxed">{children}</li>
            ),
            // 테이블 — 재무 데이터 등 overflow 스크롤
            table: ({ children }: { children?: React.ReactNode }) => (
              <div className="overflow-x-auto mb-4">
                <table className="w-full text-sm border-collapse border border-border">
                  {children}
                </table>
              </div>
            ),
            thead: ({ children }: { children?: React.ReactNode }) => (
              <thead className="bg-muted">{children}</thead>
            ),
            th: ({ children }: { children?: React.ReactNode }) => (
              <th className="border border-border px-3 py-2 text-left font-semibold text-foreground">
                {children}
              </th>
            ),
            td: ({ children }: { children?: React.ReactNode }) => (
              <td className="border border-border px-3 py-2 text-foreground/90">{children}</td>
            ),
            // 코드
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            code: ({ children, className: codeClass, inline }: any) => {
              if (!inline && codeClass?.startsWith("language-")) {
                return (
                  <pre className="bg-muted rounded-md p-3 overflow-x-auto mb-3">
                    <code className="text-xs font-mono text-foreground">{children}</code>
                  </pre>
                );
              }
              return (
                <code className="bg-muted px-1 py-0.5 rounded text-xs font-mono text-foreground">
                  {children}
                </code>
              );
            },
            // 수평 구분선
            hr: () => <hr className="my-4 border-border" />,
            // 인용구
            blockquote: ({ children }: { children?: React.ReactNode }) => (
              <blockquote className="border-l-4 border-primary/30 pl-4 my-3 text-muted-foreground italic">
                {children}
              </blockquote>
            ),
            // 굵게/기울임
            strong: ({ children }: { children?: React.ReactNode }) => (
              <strong className="font-semibold text-foreground">{children}</strong>
            ),
            em: ({ children }: { children?: React.ReactNode }) => (
              <em className="italic text-foreground/80">{children}</em>
            ),
          } as object // react-markdown v8 + React 19 타입 호환성
        }
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
