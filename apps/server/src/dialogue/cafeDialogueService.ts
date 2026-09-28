import type { DatabaseSync } from "node:sqlite";
import type { DialogueResponse } from "@games/shared";
import { loadBaristaContent, type DialogueStep } from "../content/loadContent.js";
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
  return (normalizeApostrophes(text).toLowerCase().match(/[a-z']+/g) ?? [])
    .map((token) => token.replace(/^'+|'+$/g, "")) // 去掉包在单词外面的引号：'hello' -> hello，don't 保持不变
    .filter((token) => token.length > 0);
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
 * 多词短语（如 'to go'/'no thanks'）按分词后的连续子序列匹配，天然免疫子串误命中；
 * 短语在整句范围内匹配（不受逗号切分影响，'No, thanks.' 能命中 'no thanks'），
 * 且本身已经是完整、明确的意思，不再额外做否定/提问检测。
 * 单个词的关键词在同一分句里必须满足：
 * - 前面没有否定词（'don't'/'not'/'no' 等），挡掉"I don't want coffee"；除非该步骤标了 acceptNegated
 *   （选择题，"I don't want sugar"本身就是回答）；
 * - 前面没有该步骤配置的 blockers 提问短语（'is there tea?'/'what's a latte?' 是在问不是在点单）。
 * 不做更复杂的语义理解，只处理这些显而易见的情况。
 * 关键词/短语/blockers 全部来自 content/npcs/barista.json，新增说法只改内容不改代码。
 */
export function matchesStep(
  playerText: string,
  step: Pick<DialogueStep, "keywords" | "acceptNegated" | "blockers">,
): boolean {
  const allTokens = tokenize(playerText);
  const clauseTokens = splitClauses(playerText).map(tokenize);
  const blockerPhrases = (step.blockers ?? []).map(tokenize).filter((phrase) => phrase.length > 0);

  const isAnswerAt = (tokens: string[], index: number): boolean => {
    const before = tokens.slice(0, index);
    if (!step.acceptNegated && before.some((token) => NEGATION_WORDS.has(token))) return false;
    return !blockerPhrases.some((phrase) => containsPhrase(before, phrase));
  };

  return step.keywords.some((keyword) => {
    const keywordTokens = tokenize(keyword);
    if (keywordTokens.length === 0) return false;

    if (keywordTokens.length > 1) return containsPhrase(allTokens, keywordTokens);

    const [word] = keywordTokens;
    return clauseTokens.some((tokens) => tokens.some((token, index) => token === word && isAnswerAt(tokens, index)));
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

  if (!matchesStep(text, currentStep)) {
    startQuest(db, currentStep.questId);
    // 没听懂时用这一步自己的追问（例如第 3 步再问一遍要不要糖/堂食还是打包），缺省才用通用兜底。
    return buildResponse(BARISTA.id, currentStep.fallback ?? BARISTA.fallback);
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
