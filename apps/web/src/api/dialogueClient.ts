import type { DialogueResponse } from "@games/shared";

// 默认走同源相对路径：本地开发由 vite.config.ts 的 server.proxy 转发到 apps/server，
// 避免浏览器端跨源请求触发 CORS（apps/server 未配置 CORS，也不在本任务 paths 内）。
// 生产环境如需指向不同域名的 API，用 VITE_API_BASE_URL 覆盖（需要目标域名自己处理 CORS 或反向代理）。
const DEFAULT_BASE_URL = "";

function resolveBaseUrl(): string {
  const fromEnv = import.meta.env.VITE_API_BASE_URL as string | undefined;
  return fromEnv && fromEnv.length > 0 ? fromEnv : DEFAULT_BASE_URL;
}

export async function fetchDialogueReply(npcId: string, playerText: string): Promise<DialogueResponse> {
  const res = await fetch(`${resolveBaseUrl()}/api/dialogue`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ npcId, playerText }),
  });

  if (!res.ok) {
    throw new Error(`/api/dialogue request failed with status ${res.status}`);
  }

  return (await res.json()) as DialogueResponse;
}
