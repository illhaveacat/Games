import type { Quest } from "@games/shared";

/**
 * 开场关卡（咖啡馆点单）任务链，对应 docs/product.md 的具体设定：
 * 打招呼 -> 点单 -> 回答追问。总奖励经验在完成前两条后刚好跨过等级 2 的阈值（100 xp）。
 */
export const QUESTS: Quest[] = [
  {
    id: "quest-greet-barista",
    npcId: "npc-barista",
    title: "跟咖啡师打招呼",
    completionCriteria: "用英语和咖啡师打招呼，说明自己是新来的",
    rewardXp: 40,
    rewardPoints: 10,
  },
  {
    id: "quest-order-coffee",
    npcId: "npc-barista",
    title: "点一杯咖啡和一份点心",
    completionCriteria: "用英语向咖啡师点一杯咖啡和一份点心",
    rewardXp: 60,
    rewardPoints: 15,
  },
  {
    id: "quest-answer-followup",
    npcId: "npc-barista",
    title: "回答咖啡师的追问",
    completionCriteria: "用英语回答是否加糖、堂食还是打包",
    rewardXp: 80,
    rewardPoints: 20,
  },
];

export function findQuestById(id: string): Quest | undefined {
  return QUESTS.find((quest) => quest.id === id);
}

export interface UnlockDefinition {
  id: string;
  requiredLevel: number;
  description: string;
}

export const UNLOCKS: UnlockDefinition[] = [
  {
    id: "npc-barista-extra-line",
    requiredLevel: 2,
    description: "咖啡师解锁一句新台词（测试用内容标记）",
  },
];

export function unlocksForLevel(level: number): UnlockDefinition[] {
  return UNLOCKS.filter((unlock) => unlock.requiredLevel <= level);
}
