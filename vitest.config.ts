import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    // 브라우저 환경이 아닌 Node.js 환경에서 실행 (서버 사이드 함수 테스트)
    environment: "node",
    // describe/it/expect/beforeEach 등 vitest 전역 함수를 import 없이 사용 가능
    globals: true,
  },
  resolve: {
    // Next.js @/ 경로 alias를 Vitest에서도 인식하도록 설정
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
