import type { DatabaseSync } from "node:sqlite";
import { getLevelForXp, type PlayerProgress, type Quest, type QuestProgress, type QuestStatus } from "@games/shared";
import { QUESTS, findQuestById, unlocksForLevel } from "./quests.js";

const DEFAULT_PLAYER_ID = "player-1";

interface PlayerRow {
  player_id: string;
  xp: number;
  points: number;
}

function getOrCreatePlayerRow(db: DatabaseSync): PlayerRow {
  const existing = db
    .prepare("SELECT player_id, xp, points FROM player_progress WHERE player_id = ?")
    .get(DEFAULT_PLAYER_ID) as PlayerRow | undefined;
  if (existing) return existing;
  db.prepare("INSERT INTO player_progress (player_id, xp, points) VALUES (?, 0, 0)").run(DEFAULT_PLAYER_ID);
  return { player_id: DEFAULT_PLAYER_ID, xp: 0, points: 0 };
}

function getQuestStatus(db: DatabaseSync, questId: string): QuestStatus {
  const row = db
    .prepare("SELECT status FROM quest_progress WHERE player_id = ? AND quest_id = ?")
    .get(DEFAULT_PLAYER_ID, questId) as { status: QuestStatus } | undefined;
  return row?.status ?? "not_started";
}

function setQuestStatus(db: DatabaseSync, questId: string, status: QuestStatus): void {
  db.prepare(
    `INSERT INTO quest_progress (player_id, quest_id, status) VALUES (?, ?, ?)
     ON CONFLICT(player_id, quest_id) DO UPDATE SET status = excluded.status`,
  ).run(DEFAULT_PLAYER_ID, questId, status);
}

export interface QuestListEntry {
  quest: Quest;
  progress: QuestProgress;
}

export function listQuestsWithProgress(db: DatabaseSync): QuestListEntry[] {
  return QUESTS.map((quest) => ({
    quest,
    progress: { questId: quest.id, status: getQuestStatus(db, quest.id) },
  }));
}

export interface PlayerProgressResponse extends PlayerProgress {
  unlocks: string[];
}

export function getPlayerProgress(db: DatabaseSync): PlayerProgressResponse {
  const row = getOrCreatePlayerRow(db);
  const completedQuestIds = QUESTS.filter((quest) => getQuestStatus(db, quest.id) === "completed").map(
    (quest) => quest.id,
  );
  const level = getLevelForXp(row.xp);
  return {
    level,
    xp: row.xp,
    points: row.points,
    completedQuestIds,
    unlocks: unlocksForLevel(level).map((unlock) => unlock.id),
  };
}

export function startQuest(db: DatabaseSync, questId: string): QuestProgress | null {
  if (!findQuestById(questId)) return null;
  if (getQuestStatus(db, questId) === "not_started") {
    setQuestStatus(db, questId, "in_progress");
  }
  return { questId, status: getQuestStatus(db, questId) };
}

export interface CompleteQuestResult {
  progress: QuestProgress;
  playerProgress: PlayerProgressResponse;
  newlyUnlocked: string[];
}

/**
 * 完成任务：已完成的任务再次 complete 是幂等的，不会重复发放经验/积分。
 * 未完成 -> 完成 时才真实累加 xp/points 并落盘，随后按等级变化算出本次新解锁的内容。
 */
export function completeQuest(db: DatabaseSync, questId: string): CompleteQuestResult | null {
  const quest = findQuestById(questId);
  if (!quest) return null;

  if (getQuestStatus(db, questId) === "completed") {
    return {
      progress: { questId, status: "completed" },
      playerProgress: getPlayerProgress(db),
      newlyUnlocked: [],
    };
  }

  const row = getOrCreatePlayerRow(db);
  const levelBefore = getLevelForXp(row.xp);
  const newXp = row.xp + quest.rewardXp;
  const newPoints = row.points + quest.rewardPoints;
  db.prepare("UPDATE player_progress SET xp = ?, points = ? WHERE player_id = ?").run(
    newXp,
    newPoints,
    DEFAULT_PLAYER_ID,
  );
  setQuestStatus(db, questId, "completed");

  const levelAfter = getLevelForXp(newXp);
  const newlyUnlocked = unlocksForLevel(levelAfter)
    .filter((unlock) => unlock.requiredLevel > levelBefore)
    .map((unlock) => unlock.id);

  return {
    progress: { questId, status: "completed" },
    playerProgress: getPlayerProgress(db),
    newlyUnlocked,
  };
}
