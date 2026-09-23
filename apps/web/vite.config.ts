import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // 开发态同源代理到 apps/server，避免浏览器端直连跨源触发 CORS 失败
      // （apps/server 未配置 CORS，且不在本任务 paths 内，不能在这改）。
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
  },
});
