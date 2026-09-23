export interface DialogueRequest {
  speakerId: string;
  text: string;
}

export interface DialogueResponse {
  speakerId: string;
  text: string;
  timestamp: number;
}

export function createDialogueRequest(input: { speakerId: string; text: string }): DialogueRequest {
  const { speakerId, text } = input;
  if (typeof speakerId !== "string" || speakerId === "") {
    throw new Error("speakerId 不能为空");
  }
  if (typeof text !== "string" || text === "") {
    throw new Error("text 不能为空");
  }
  return { speakerId, text };
}

export function createDialogueResponse(
  input: { speakerId: string; text: string; timestamp?: number },
): DialogueResponse {
  const { speakerId, text, timestamp = Date.now() } = input;
  if (typeof speakerId !== "string" || speakerId === "") {
    throw new Error("speakerId 不能为空");
  }
  if (typeof text !== "string" || text === "") {
    throw new Error("text 不能为空");
  }
  return { speakerId, text, timestamp };
}

export interface Quest {
  id: string;
  npcId: string;
  title: string;
  completionCriteria: string;
  rewardXp: number;
  rewardPoints: number;
}

export type QuestStatus = "not_started" | "in_progress" | "completed";

const QUEST_STATUSES: QuestStatus[] = ["not_started", "in_progress", "completed"];

export interface QuestProgress {
  questId: string;
  status: QuestStatus;
}

export interface PlayerProgress {
  level: number;
  xp: number;
  points: number;
  completedQuestIds: string[];
}

function requireNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string" || value === "") {
    throw new Error(`${field} 不能为空`);
  }
  return value;
}

function requireNonNegativeNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || Number.isNaN(value) || value < 0) {
    throw new Error(`${field} 必须是不小于 0 的数字`);
  }
  return value;
}

export function createQuest(input: {
  id: string;
  npcId: string;
  title: string;
  completionCriteria: string;
  rewardXp: number;
  rewardPoints: number;
}): Quest {
  const id = requireNonEmptyString(input.id, "id");
  const npcId = requireNonEmptyString(input.npcId, "npcId");
  const title = requireNonEmptyString(input.title, "title");
  const completionCriteria = requireNonEmptyString(input.completionCriteria, "completionCriteria");
  const rewardXp = requireNonNegativeNumber(input.rewardXp, "rewardXp");
  const rewardPoints = requireNonNegativeNumber(input.rewardPoints, "rewardPoints");
  return { id, npcId, title, completionCriteria, rewardXp, rewardPoints };
}

export function createQuestProgress(input: { questId: string; status?: QuestStatus }): QuestProgress {
  const questId = requireNonEmptyString(input.questId, "questId");
  const status = input.status ?? "not_started";
  if (!QUEST_STATUSES.includes(status)) {
    throw new Error(`status 必须是 ${QUEST_STATUSES.join("/")} 之一`);
  }
  return { questId, status };
}

/**
 * 等级->经验阈值规则：xp 达到某等级的 minXp 即视为该等级（含边界），
 * 超过最高阈值后维持在最高等级，不设上限告警。
 */
export interface LevelThreshold {
  level: number;
  minXp: number;
}

export const LEVEL_THRESHOLDS: LevelThreshold[] = [
  { level: 1, minXp: 0 },
  { level: 2, minXp: 100 },
  { level: 3, minXp: 250 },
  { level: 4, minXp: 500 },
  { level: 5, minXp: 1000 },
];

export function getLevelForXp(xp: number): number {
  requireNonNegativeNumber(xp, "xp");
  let level = LEVEL_THRESHOLDS[0].level;
  for (const threshold of LEVEL_THRESHOLDS) {
    if (xp >= threshold.minXp) {
      level = threshold.level;
    } else {
      break;
    }
  }
  return level;
}

export function createPlayerProgress(
  input: { xp?: number; points?: number; completedQuestIds?: string[] } = {},
): PlayerProgress {
  const xp = requireNonNegativeNumber(input.xp ?? 0, "xp");
  const points = requireNonNegativeNumber(input.points ?? 0, "points");
  const completedQuestIds = input.completedQuestIds ?? [];
  if (!Array.isArray(completedQuestIds) || completedQuestIds.some((id) => typeof id !== "string")) {
    throw new Error("completedQuestIds 必须是字符串数组");
  }
  return { level: getLevelForXp(xp), xp, points, completedQuestIds };
}
