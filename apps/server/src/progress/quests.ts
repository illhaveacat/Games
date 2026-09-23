import type { Quest } from "@games/shared";
import { loadBaristaContent, loadQuests } from "../content/loadContent.js";

/**
 * 开场关卡（咖啡馆点单）任务链，来自 content/quests/cafe-opening.json（STAGE-001），
 * 对应 docs/product.md 的具体设定：打招呼 -> 点单 -> 回答追问。
 * 总奖励经验在完成前两条后刚好跨过等级 2 的阈值（100 xp）。
 */
export const QUESTS: Quest[] = loadQuests();

export function findQuestById(id: string): Quest | undefined {
  return QUESTS.find((quest) => quest.id === id);
}

export interface UnlockDefinition {
  id: string;
  requiredLevel: number;
  description: string;
}

/** 解锁目录来自咖啡师的内容包（content/npcs/barista.json 的 unlock 字段），跟对话内容保持单一事实来源。 */
const BARISTA_UNLOCK = loadBaristaContent().unlock;

export const UNLOCKS: UnlockDefinition[] = [
  {
    id: BARISTA_UNLOCK.id,
    requiredLevel: BARISTA_UNLOCK.requiredLevel,
    description: BARISTA_UNLOCK.description,
  },
];

export function unlocksForLevel(level: number): UnlockDefinition[] {
  return UNLOCKS.filter((unlock) => unlock.requiredLevel <= level);
}
