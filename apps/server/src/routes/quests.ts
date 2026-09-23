import { Router } from "express";
import type { DatabaseSync } from "node:sqlite";
import { findQuestById } from "../progress/quests.js";
import { completeQuest, getPlayerProgress, listQuestsWithProgress, startQuest } from "../progress/progressStore.js";

/**
 * 任务列表/进度/玩家等级积分接口。未知任务返回 404，非法/缺失 action 返回 400——
 * 明确决定：不给 action 猜默认值，因为 complete 会不可逆地发奖，畸形输入绝不能被当成 complete。
 * 输入校验覆盖的路径不会 500；但底层 SQLite/数据库异常不做额外捕获，会按 Express 默认行为冒泡成 500。
 */
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
    const action = body.action;
    if (action !== "start" && action !== "complete") {
      res.status(400).json({ error: "invalid_action", detail: "action 必须是 'start' 或 'complete'" });
      return;
    }

    if (action === "start") {
      res.status(200).json({ progress: startQuest(db, questId) });
      return;
    }

    res.status(200).json(completeQuest(db, questId));
  });

  return router;
}
