import { describe, expect, it } from "vitest";
import { createDatabase } from "../progress/db.js";
import { getPlayerProgress, listQuestsWithProgress } from "../progress/progressStore.js";
import { generateCafeReply, isCafeNpc } from "./cafeDialogueService.js";

describe("isCafeNpc", () => {
  it("recognizes the barista npc id and rejects others", () => {
    expect(isCafeNpc("npc-barista")).toBe(true);
    expect(isCafeNpc("npc-mira")).toBe(false);
    expect(isCafeNpc("")).toBe(false);
  });
});

describe("generateCafeReply", () => {
  it("gives a gentle fallback (not a failure) for unrelated input, and starts the first quest as in_progress", () => {
    const db = createDatabase(":memory:");
    const reply = generateCafeReply(db, "what a nice day");

    expect(reply.speakerId).toBe("npc-barista");
    expect(reply.text.length).toBeGreaterThan(0);
    expect(reply.text.toLowerCase()).not.toContain("fail");

    const entries = listQuestsWithProgress(db);
    expect(entries.find((e) => e.quest.id === "quest-greet-barista")?.progress.status).toBe("in_progress");
  });

  it("advances the quest chain step by step as the player's words match, awarding xp/points for real", () => {
    const db = createDatabase(":memory:");

    const first = generateCafeReply(db, "Hello! I'm new here.");
    expect(first.text.toLowerCase()).toContain("welcome");
    let progress = getPlayerProgress(db);
    expect(progress).toMatchObject({ level: 1, xp: 40, points: 10 });
    expect(progress.completedQuestIds).toEqual(["quest-greet-barista"]);

    // 第一步完成后，一句不相关的话不应该跳过第二步、也不应该判失败
    const offTopic = generateCafeReply(db, "what's the weather like");
    expect(offTopic.text.toLowerCase()).not.toContain("fail");
    expect(getPlayerProgress(db).xp).toBe(40); // 未推进，没有多发奖

    const second = generateCafeReply(db, "Can I get a coffee and a pastry please");
    expect(second.text.toLowerCase()).toContain("sugar");
    progress = getPlayerProgress(db);
    expect(progress).toMatchObject({ level: 2, xp: 100, points: 25 });
    expect(progress.completedQuestIds.sort()).toEqual(["quest-greet-barista", "quest-order-coffee"].sort());

    const third = generateCafeReply(db, "no sugar please, and it's to go");
    progress = getPlayerProgress(db);
    expect(progress).toMatchObject({ level: 2, xp: 180, points: 45 });
    expect(progress.completedQuestIds.sort()).toEqual(
      ["quest-greet-barista", "quest-order-coffee", "quest-answer-followup"].sort(),
    );
    expect(third.text.length).toBeGreaterThan(0);
  });

  it("includes the barista's unlocked extra line once the player has reached the required level (real, observable unlock effect)", () => {
    const db = createDatabase(":memory:");
    generateCafeReply(db, "hello");
    // 40xp，还没到 level 2，回复不应该带解锁台词
    const beforeUnlock = generateCafeReply(db, "irrelevant");
    expect(beforeUnlock.text).not.toContain("bookshop");

    const atLevelUp = generateCafeReply(db, "coffee and a pastry"); // 40+60=100xp -> level 2，触发解锁
    expect(atLevelUp.text).toContain("bookshop");

    // 解锁是持久的，不是一次性事件：后续任意回复都应该继续带着这句
    const after = generateCafeReply(db, "sugar please, for here");
    expect(after.text).toContain("bookshop");
  });

  it("gives a friendly closing reply (not an error) once the whole quest chain is already completed", () => {
    const db = createDatabase(":memory:");
    generateCafeReply(db, "hello");
    generateCafeReply(db, "coffee and a pastry");
    generateCafeReply(db, "sugar, to go");

    const afterAllDone = generateCafeReply(db, "anything at all");
    expect(afterAllDone.text.length).toBeGreaterThan(0);
    expect(afterAllDone.text.toLowerCase()).not.toContain("fail");
    // 没有因为任务都完成了而重复发奖
    expect(getPlayerProgress(db).xp).toBe(180);
  });
});
