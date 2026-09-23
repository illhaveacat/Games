import { describe, expect, it } from "vitest";
import { loadBaristaContent, loadCafeScene, loadQuests } from "./loadContent.js";

describe("loadQuests", () => {
  it("loads and validates the cafe-opening quest chain from content/quests/cafe-opening.json", () => {
    const quests = loadQuests();
    expect(quests).toHaveLength(3);
    expect(quests.map((q) => q.id)).toEqual([
      "quest-greet-barista",
      "quest-order-coffee",
      "quest-answer-followup",
    ]);
    for (const quest of quests) {
      expect(quest.npcId).toBe("npc-barista");
      expect(quest.rewardXp).toBeGreaterThan(0);
      expect(quest.rewardPoints).toBeGreaterThan(0);
      expect(quest.title.length).toBeGreaterThan(0);
      expect(quest.completionCriteria.length).toBeGreaterThan(0);
    }
    // 前两个任务奖励之和刚好触发 @games/shared LEVEL_THRESHOLDS 的 level 2（100 xp）。
    expect(quests[0].rewardXp + quests[1].rewardXp).toBe(100);
  });
});

describe("loadBaristaContent", () => {
  it("loads the barista's dialogue steps in the same order as the quest chain", () => {
    const barista = loadBaristaContent();
    expect(barista.id).toBe("npc-barista");
    expect(barista.steps.map((s) => s.questId)).toEqual([
      "quest-greet-barista",
      "quest-order-coffee",
      "quest-answer-followup",
    ]);
    for (const step of barista.steps) {
      expect(step.keywords.length).toBeGreaterThan(0);
      expect(step.reply.length).toBeGreaterThan(0);
    }
    expect(barista.fallback.length).toBeGreaterThan(0);
    expect(barista.afterAllCompleteReply.length).toBeGreaterThan(0);
    expect(barista.unlock.id.length).toBeGreaterThan(0);
    expect(barista.unlock.requiredLevel).toBeGreaterThan(1);
  });
});

describe("loadCafeScene", () => {
  it("loads the cafe scene referencing the same npc and quest ids", () => {
    const scene = loadCafeScene();
    expect(scene.npcId).toBe("npc-barista");
    expect(scene.questIds).toEqual([
      "quest-greet-barista",
      "quest-order-coffee",
      "quest-answer-followup",
    ]);
  });
});
