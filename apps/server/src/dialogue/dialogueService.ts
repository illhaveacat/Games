import type { DialogueResponse } from "@games/shared";
import { NPCS, UNKNOWN_NPC_REPLY } from "./npcs.js";

function buildResponse(speakerId: string, text: string): DialogueResponse {
  return { speakerId, text, timestamp: Date.now() };
}

/**
 * 规则/模板对话逻辑：已知 npcId + 关键词命中给出对应回复，
 * 未知 npcId 或未命中关键词一律走兜底回复，绝不抛错。
 */
export function generateReply(npcId: unknown, playerText: unknown): DialogueResponse {
  if (typeof npcId !== "string" || npcId.trim() === "") {
    return buildResponse("narrator", UNKNOWN_NPC_REPLY);
  }

  const npc = NPCS[npcId];
  if (!npc) {
    return buildResponse(npcId, UNKNOWN_NPC_REPLY);
  }

  const text = typeof playerText === "string" ? playerText.toLowerCase() : "";
  const matched = npc.rules.find((rule) => rule.keywords.some((keyword) => text.includes(keyword)));

  return buildResponse(npcId, matched ? matched.reply : npc.fallback);
}
