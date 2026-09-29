import type { DatabaseSync } from "node:sqlite";
import type { DialogueResponse } from "@games/shared";
import { loadBaristaContent, type DialogueStep, type OrderItemGroup } from "../content/loadContent.js";
import { completeQuest, getPlayerProgress, listQuestsWithProgress, startQuest } from "../progress/progressStore.js";

const BARISTA = loadBaristaContent();

/**
 * 玩家一句话的处理长度上限（字符数）。超出部分直接截掉、不报错，路由照常返回 200 和咖啡师的回复——
 * 正常一句英语远短于此；express.json() 默认允许 100 KB 的请求体，不设上限的话超长输入会白白占用事件循环。
 */
export const MAX_PLAYER_TEXT_LENGTH = 500;

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

/** tokens 里是否有 phrase 恰好在下标 end 处结束。 */
function endsPhraseAt(tokens: string[], end: number, phrase: string[]): boolean {
  const start = end - phrase.length + 1;
  return start >= 0 && phrase.every((word, offset) => tokens[start + offset] === word);
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
  const blockerPhrases = (step.blockers ?? []).map(tokenize).filter((phrase) => phrase.length > 0);

  const phraseKeywords: string[][] = [];
  const wordKeywords = new Set<string>();
  for (const keyword of step.keywords) {
    const keywordTokens = tokenize(keyword);
    if (keywordTokens.length === 1) wordKeywords.add(keywordTokens[0]);
    else if (keywordTokens.length > 1) phraseKeywords.push(keywordTokens);
  }

  if (phraseKeywords.some((phrase) => containsPhrase(allTokens, phrase))) return true;
  if (wordKeywords.size === 0) return false;

  // 每个分句只从左到右扫一遍，边扫边记"前面是否已出现否定词 / blocker 短语"，整体是线性的。
  // （曾经每命中一个关键词就 slice 前缀重扫，输入很长时是 O(n²)，见 DIALOG-001 审查 P1。）
  return splitClauses(playerText)
    .map(tokenize)
    .some((tokens) => {
      let negated = false;
      let blocked = false;
      for (let i = 0; i < tokens.length; i++) {
        if (wordKeywords.has(tokens[i]) && (step.acceptNegated || !negated) && !blocked) return true;
        if (NEGATION_WORDS.has(tokens[i])) negated = true;
        if (!blocked && blockerPhrases.some((phrase) => endsPhraseAt(tokens, i, phrase))) blocked = true;
      }
      return false;
    });
}

/**
 * 玩家点单里，某一类物品（饮品/点心）具体是哪个：按 options 顺序找第一个命中的，判定复用 matchesStep
 * 本身的否定/blocker 规则（跟"这一步算不算点单"用的是同一套语境判断，不会出现"判定没点但复述了具体名字"）。
 * 都没命中就用 default（例如玩家只说了句型 "Can I get a hot chocolate?"，东西不在词表里）。
 */
function pickOrderLabel(
  playerText: string,
  group: OrderItemGroup,
  step: Pick<DialogueStep, "acceptNegated" | "blockers">,
): string {
  const matched = group.options.find((option) =>
    matchesStep(playerText, { keywords: option.keywords, acceptNegated: step.acceptNegated, blockers: step.blockers }),
  );
  return matched?.label ?? group.default;
}

/** DIALOG-002：把 replyTemplate 的 {drink}/{pastry} 占位符换成玩家实际点的东西。 */
function renderOrderReply(playerText: string, step: DialogueStep): string {
  const { drinks, pastries } = step.orderItems!;
  return step
    .replyTemplate!.replace("{drink}", pickOrderLabel(playerText, drinks, step))
    .replace("{pastry}", pickOrderLabel(playerText, pastries, step));
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
  const text = typeof playerText === "string" ? playerText.slice(0, MAX_PLAYER_TEXT_LENGTH) : "";
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
  const replyText = currentStep.replyTemplate ? renderOrderReply(text, currentStep) : currentStep.reply!;
  return buildResponse(BARISTA.id, replyText + unlockSuffix(db));
}

function unlockSuffix(db: DatabaseSync): string {
  const unlocked = getPlayerProgress(db).unlocks.includes(BARISTA.unlock.id);
  return unlocked ? ` ${BARISTA.unlock.extraLine}` : "";
}
