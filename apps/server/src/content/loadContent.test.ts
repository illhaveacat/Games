import { describe, expect, it } from "vitest";
import { loadBaristaContent, loadCafeScene, loadQuests, validateBaristaContent } from "./loadContent.js";

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
      // DIALOG-002：第 2 步用 replyTemplate（带占位符，按玩家实际点的东西渲染）而不是固定 reply。
      if (step.replyTemplate !== undefined) {
        expect(step.replyTemplate.length).toBeGreaterThan(0);
        expect(step.orderItems).toBeDefined();
      } else {
        expect(step.reply?.length).toBeGreaterThan(0);
      }
    }
    expect(barista.fallback.length).toBeGreaterThan(0);
    expect(barista.afterAllCompleteReply.length).toBeGreaterThan(0);
    expect(barista.unlock.id.length).toBeGreaterThan(0);
    expect(barista.unlock.requiredLevel).toBeGreaterThan(1);
  });

  it("gives every step its own in-context follow-up question (DIALOG-001)", () => {
    const barista = loadBaristaContent();
    for (const step of barista.steps) {
      expect(step.fallback?.length ?? 0).toBeGreaterThan(0);
      expect(step.fallback).not.toBe(barista.fallback);
    }
  });
});

describe("validateBaristaContent", () => {
  const base = () => structuredClone(loadBaristaContent());

  it("accepts the shipped content", () => {
    expect(() => validateBaristaContent(base())).not.toThrow();
  });

  it("rejects a step whose keywords are missing, empty or contain blank strings (typo protection for hand-edited content)", () => {
    const missing = base();
    delete (missing.steps[0] as { keywords?: string[] }).keywords;
    expect(() => validateBaristaContent(missing)).toThrow(/steps\[0\]\.keywords/);

    const empty = base();
    empty.steps[1].keywords = [];
    expect(() => validateBaristaContent(empty)).toThrow(/steps\[1\]\.keywords/);

    const blank = base();
    blank.steps[2].keywords = ["sugar", "  "];
    expect(() => validateBaristaContent(blank)).toThrow(/steps\[2\]\.keywords/);
  });

  it("rejects malformed optional fields (blockers / fallback / acceptNegated)", () => {
    const blockers = base();
    (blockers.steps[1] as { blockers?: unknown }).blockers = "is there";
    expect(() => validateBaristaContent(blockers)).toThrow(/blockers/);

    const fallback = base();
    (fallback.steps[0] as { fallback?: unknown }).fallback = "";
    expect(() => validateBaristaContent(fallback)).toThrow(/fallback/);

    const negated = base();
    (negated.steps[2] as { acceptNegated?: unknown }).acceptNegated = "yes";
    expect(() => validateBaristaContent(negated)).toThrow(/acceptNegated/);
  });

  it("DIALOG-002: 每一步必须有 reply 或 replyTemplate 其中之一", () => {
    const neither = base();
    delete (neither.steps[0] as { reply?: string }).reply; // steps[0] 只有 reply，没有 replyTemplate
    expect(() => validateBaristaContent(neither)).toThrow(/必须有非空的 reply 或 replyTemplate/);
  });

  it("DIALOG-002: 有 replyTemplate 就必须有 orderItems，且 drinks/pastries 的 default 与 options 要合法", () => {
    const noOrderItems = base();
    delete (noOrderItems.steps[1] as { orderItems?: unknown }).orderItems;
    expect(() => validateBaristaContent(noOrderItems)).toThrow(/orderItems/);

    const noDefault = base();
    delete (noDefault.steps[1].orderItems!.drinks as { default?: string }).default;
    expect(() => validateBaristaContent(noDefault)).toThrow(/orderItems\.drinks\.default/);

    const emptyOptions = base();
    emptyOptions.steps[1].orderItems!.pastries.options = [];
    expect(() => validateBaristaContent(emptyOptions)).toThrow(/orderItems\.pastries\.options/);

    const badLabel = base();
    (badLabel.steps[1].orderItems!.drinks.options[0] as { label?: unknown }).label = "";
    expect(() => validateBaristaContent(badLabel)).toThrow(/orderItems\.drinks\.options\[0\]\.label/);

    const badKeywords = base();
    (badKeywords.steps[1].orderItems!.pastries.options[0] as { keywords?: unknown }).keywords = [];
    expect(() => validateBaristaContent(badKeywords)).toThrow(/orderItems\.pastries\.options\[0\]\.keywords/);
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
