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
  /** 单个词按词边界匹配（且默认不能被否定词修饰）；含空格的是短语，按连续词序列匹配，不做否定检测。 */
  keywords: string[];
  /** 为 true 时单个词即使被否定（"I don't want sugar"）也算回答了这一步，适用于"要不要/哪种"这类选择题。 */
  acceptNegated?: boolean;
  /** 出现在关键词之前（同一分句）的提问式短语（"is there"/"what's"…），此时关键词是在问而不是在答。 */
  blockers?: string[];
  /** 这一步没听懂时的追问；缺省用 NpcContent.fallback。 */
  fallback?: string;
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
  /**
   * 内容包里的欢迎语，目前没有代码在读它——apps/web 的 welcomeMessage.ts 另外手写了一份
   * 展示在页面上的欢迎语（避免 Vite 跨项目根目录读 content/ 的复杂度，见该文件的注释）。
   * 保留这个字段是当作 content 包自身的文档/给关卡设计者看的参考，不是死代码 bug；
   * 以后如果 apps/web 能直接读 content/，这里就是它应该读取的那份事实来源。
   */
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

function assertStringArray(value: unknown, label: string, { nonEmpty }: { nonEmpty: boolean }): void {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.trim() === "")) {
    throw new Error(`content/npcs/barista.json: ${label} 必须是非空字符串数组`);
  }
  if (nonEmpty && value.length === 0) {
    throw new Error(`content/npcs/barista.json: ${label} 不能为空`);
  }
}

/** 内容包是人手写的：字段写错（拼错键名、漏写数组）在加载时就报出来，而不是等玩家说话时才崩。 */
export function validateBaristaContent(content: NpcContent): NpcContent {
  content.steps.forEach((step, i) => {
    const label = `steps[${i}]`;
    assertStringArray(step.keywords, `${label}.keywords`, { nonEmpty: true });
    if (step.blockers !== undefined) assertStringArray(step.blockers, `${label}.blockers`, { nonEmpty: false });
    if (step.fallback !== undefined && (typeof step.fallback !== "string" || step.fallback.trim() === "")) {
      throw new Error(`content/npcs/barista.json: ${label}.fallback 必须是非空字符串`);
    }
    if (step.acceptNegated !== undefined && typeof step.acceptNegated !== "boolean") {
      throw new Error(`content/npcs/barista.json: ${label}.acceptNegated 必须是布尔值`);
    }
  });
  return content;
}

export function loadBaristaContent(): NpcContent {
  return validateBaristaContent(readJson<NpcContent>("npcs/barista.json"));
}

export function loadCafeScene(): SceneContent {
  return readJson<SceneContent>("scenes/cafe-opening.json");
}
