import type { PlayerProgress, Quest, QuestProgress } from "@games/shared";

// 同源相对路径，vite.config.ts 的 server.proxy 转发 /api 到 apps/server（同 dialogueClient.ts 的约定）。
const DEFAULT_BASE_URL = "";

function resolveBaseUrl(): string {
  const fromEnv = import.meta.env.VITE_API_BASE_URL as string | undefined;
  return fromEnv && fromEnv.length > 0 ? fromEnv : DEFAULT_BASE_URL;
}

export interface QuestListEntry {
  quest: Quest;
  progress: QuestProgress;
}

// apps/server 的 GET /api/progress 在 @games/shared 的 PlayerProgress 基础上多返回一个
// unlocks 字段（QUEST-BACKEND-001 的解锁效果），shared 契约本身不含这个字段，这里按实际响应形状声明。
export interface PlayerProgressView extends PlayerProgress {
  unlocks: string[];
}

export async function fetchQuests(): Promise<QuestListEntry[]> {
  const res = await fetch(`${resolveBaseUrl()}/api/quests`);
  if (!res.ok) {
    throw new Error(`/api/quests request failed with status ${res.status}`);
  }
  return (await res.json()) as QuestListEntry[];
}

export async function fetchPlayerProgress(): Promise<PlayerProgressView> {
  const res = await fetch(`${resolveBaseUrl()}/api/progress`);
  if (!res.ok) {
    throw new Error(`/api/progress request failed with status ${res.status}`);
  }
  return (await res.json()) as PlayerProgressView;
}
