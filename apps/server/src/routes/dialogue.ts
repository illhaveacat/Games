import { Router } from "express";
import type { DatabaseSync } from "node:sqlite";
import { generateReply } from "../dialogue/dialogueService.js";
import { generateCafeReply, isCafeNpc } from "../dialogue/cafeDialogueService.js";

/** 咖啡馆 NPC（npc-barista）走任务链驱动的对话逻辑；其余 NPC 走原有的规则/模板回复，互不影响。 */
export function createDialogueRouter(db: DatabaseSync): Router {
  const router = Router();

  router.post("/dialogue", (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const npcId = body.npcId;

    if (typeof npcId === "string" && isCafeNpc(npcId)) {
      res.status(200).json(generateCafeReply(db, body.playerText));
      return;
    }

    res.status(200).json(generateReply(npcId, body.playerText));
  });

  return router;
}
