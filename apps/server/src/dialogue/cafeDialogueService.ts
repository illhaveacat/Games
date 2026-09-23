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

function matchesStep(playerText: string, keywords: string[]): boolean {
  const lower = playerText.toLowerCase();
  return keywords.some((keyword) => lower.includes(keyword));
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
