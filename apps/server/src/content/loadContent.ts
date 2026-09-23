import fs from "node:fs";
import path from "node:path";
import { createQuest, type Quest } from "@games/shared";

/**
 * content/ 在仓库根目录，跟 apps/server 平级。用 fs 读取（而不是静态 `import ... from "../../../content/x.json"`）
 * 是为了绕开 apps/server/tsconfig.json 的 rootDir（"src"）限制——静态导入 rootDir 之外的文件会被 tsc 拒绝编译。
 * 路径按 loadContent.ts 自身位置算，dev（src）和 build（dist）下都指向同一个仓库根 content/ 目录。
 */
function contentRoot(): string {
  return path.join(import.meta.dirname, "..", "..", "..", "..", "content");
}

function readJson<T>(relativePath: string): T {
  const fullPath = path.join(contentRoot(), relativePath);
  return JSON.parse(fs.readFileSync(fullPath, "utf8")) as T;
}

export interface DialogueStep {
  questId: string;
  keywords: string[];
  reply: string;
}

export interface NpcUnlock {
  id: string;
  requiredLevel: number;
  description: string;
  extraLine: string;
}

export interface NpcContent {
  id: string;
  name: string;
  greeting: string;
  steps: DialogueStep[];
  fallback: string;
  afterAllCompleteReply: string;
  unlock: NpcUnlock;
}

export interface SceneContent {
  id: string;
  name: string;
  description: string;
  npcId: string;
  questIds: string[];
}

/** 用 @games/shared 的 createQuest 校验内容包里每条任务的字段合法，内容包坏了在加载时就能发现。 */
export function loadQuests(): Quest[] {
  const raw = readJson<Quest[]>("quests/cafe-opening.json");
  return raw.map((quest) => createQuest(quest));
}

export function loadBaristaContent(): NpcContent {
  return readJson<NpcContent>("npcs/barista.json");
}

export function loadCafeScene(): SceneContent {
  return readJson<SceneContent>("scenes/cafe-opening.json");
}
