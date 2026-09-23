import { Router } from "express";
import type { DatabaseSync } from "node:sqlite";
import { findQuestById } from "../progress/quests.js";
import { completeQuest, getPlayerProgress, listQuestsWithProgress, startQuest } from "../progress/progressStore.js";

/** 任务列表/进度/玩家等级积分接口，绝不因畸形输入抛 500，未知任务返回 404。 */
export function createQuestsRouter(db: DatabaseSync): Router {
  const router = Router();

  router.get("/quests", (_req, res) => {
    res.status(200).json(listQuestsWithProgress(db));
  });

  router.get("/progress", (_req, res) => {
    res.status(200).json(getPlayerProgress(db));
  });

  router.post("/quests/:id/progress", (req, res) => {
    const questId = req.params.id;
    if (!findQuestById(questId)) {
      res.status(404).json({ error: "quest_not_found" });
      return;
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const action = body.action === "start" ? "start" : "complete";

    if (action === "start") {
      res.status(200).json({ progress: startQuest(db, questId) });
      return;
    }

    res.status(200).json(completeQuest(db, questId));
  });

  return router;
}
