import type { DatabaseSync } from "node:sqlite";
import type { DialogueResponse } from "@games/shared";
import { loadBaristaContent } from "../content/loadContent.js";
import { completeQuest, getPlayerProgress, listQuestsWithProgress, startQuest } from "../progress/progressStore.js";

const BARISTA = loadBaristaContent();

export function isCafeNpc(npcId: string): boolean {
  return npcId === BARISTA.id;
}

function buildResponse(speakerId: string, text: string): DialogueResponse {
  return { speakerId, text, timestamp: Date.now() };
}

const NEGATION_WORDS = new Set([
  "no",
  "not",
  "don't",
  "dont",
  "doesn't",
  "doesnt",
  "isn't",
  "isnt",
  "won't",
  "wont",
  "can't",
  "cant",
  "never",
]);

/**
 * 把常见的弯引号撇号（左单引号 U+2018 '、右单引号 U+2019 '、修饰字母撇号 U+02BC ʼ）
 * 统一成直引号 '。iOS/macOS 的智能标点默认会把用户打的 don't 自动变成 don't（弯引号），
 * 如果不归一化，tokenize 用的 /[a-z']+/g 会把 "don't" 切成 "don" / "t" 两个 token，
 * "don" 不在 NEGATION_WORDS 里，否定检测直接失效——手机用户几乎必然踩到这个坑。
 */
function normalizeApostrophes(text: string): string {
  return text.replace(/[‘’ʼ]/g, "'");
}

function tokenize(text: string): string[] {
  return text.toLowerCase().match(/[a-z']+/g) ?? [];
}

/** 按逗号/句号/问号/叹号/分号切分句子，否定检测只在同一分句内生效，不跨句乱判。 */
function splitClauses(text: string): string[] {
  return normalizeApostrophes(text)
    .toLowerCase()
    .split(/[.,!?;]+/)
    .map((clause) => clause.trim())
    .filter((clause) => clause.length > 0);
}

function containsPhrase(tokens: string[], phraseTokens: string[]): boolean {
  for (let i = 0; i <= tokens.length - phraseTokens.length; i++) {
    if (phraseTokens.every((word, offset) => tokens[i + offset] === word)) return true;
  }
  return false;
}

/**
 * 按单词边界匹配，不是子串匹配——'this' 不再误命中 'hi'，'where' 不再误命中 'here'。
 * 多词短语（如 'to go'/'no sugar'）按分词后的连续子序列匹配，天然免疫子串误命中；
 * 这类短语本身已经是完整、明确的意思（'no sugar' 就是在回答不要糖），不再额外做否定检测。
 * 单个词的关键词还要求同一分句里它前面没有紧跟否定词（'don't'/'not'/'no' 等），
 * 用来挡掉"I don't want coffee"这类明确否定的句子——不做更复杂的语义理解，只处理这种显而易见的情况。
 */
function matchesStep(playerText: string, keywords: string[]): boolean {
  const clauses = splitClauses(playerText);
  return keywords.some((keyword) => {
    const lowerKeyword = keyword.toLowerCase();
    const phraseTokens = lowerKeyword.split(/\s+/).filter(Boolean);

    if (phraseTokens.length > 1) {
      return clauses.some((clause) => containsPhrase(tokenize(clause), phraseTokens));
    }

    return clauses.some((clause) => {
      const tokens = tokenize(clause);
      const index = tokens.indexOf(lowerKeyword);
      if (index === -1) return false;
      return !tokens.slice(0, index).some((token) => NEGATION_WORDS.has(token));
    });
  });
}

/**
 * 咖啡馆开场关卡的对话逻辑：按 content/npcs/barista.json 定义的任务链顺序推进。
 * 玩家说的话命中当前这一步的关键词 -> 真实调用 completeQuest 发奖并推进任务状态，
 * NPC 用符合角色的自然反应回复（不是判失败/弹窗中断）；未命中就用 fallback 温和引导重试，
 * 同时把这一步标成 in_progress（如果还没开始），任务日志能看到"进行中"。
 * 玩家等级达到解锁条件后，回复会附带咖啡师的额外台词（unlock.extraLine），
 * 这是"解锁效果在关卡里能被真实观察到"的具体实现，不只是 API 数据。
 */
export function generateCafeReply(db: DatabaseSync, playerText: unknown): DialogueResponse {
  const text = typeof playerText === "string" ? playerText : "";
  const entries = listQuestsWithProgress(db);
  const currentStep = BARISTA.steps.find((step) => {
    const entry = entries.find((e) => e.quest.id === step.questId);
    return entry?.progress.status !== "completed";
  });

  if (!currentStep) {
    return buildResponse(BARISTA.id, BARISTA.afterAllCompleteReply + unlockSuffix(db));
  }

  if (!matchesStep(text, currentStep.keywords)) {
    startQuest(db, currentStep.questId);
    return buildResponse(BARISTA.id, BARISTA.fallback);
  }

  // 先真实发奖/推进任务，再读取解锁状态——这样如果这一步的奖励正好让玩家升级触发解锁，
  // 这次回复就能立刻带上新台词，而不是要等到下一轮对话才反映出来。
  completeQuest(db, currentStep.questId);
  return buildResponse(BARISTA.id, currentStep.reply + unlockSuffix(db));
}

function unlockSuffix(db: DatabaseSync): string {
  const unlocked = getPlayerProgress(db).unlocks.includes(BARISTA.unlock.id);
  return unlocked ? ` ${BARISTA.unlock.extraLine}` : "";
}
