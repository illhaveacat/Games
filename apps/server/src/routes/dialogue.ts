import { Router } from "express";
import { generateReply } from "../dialogue/dialogueService.js";

export const dialogueRouter = Router();

dialogueRouter.post("/dialogue", (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const reply = generateReply(body.npcId, body.playerText);
  res.status(200).json(reply);
});
