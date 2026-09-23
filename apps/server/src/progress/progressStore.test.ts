import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createDatabase } from "./db.js";
import { completeQuest, getPlayerProgress, listQuestsWithProgress, startQuest } from "./progressStore.js";

describe("progressStore (in-memory)", () => {
  it("lists all quests as not_started before any progress", () => {
    const db = createDatabase(":memory:");
    const entries = listQuestsWithProgress(db);
    expect(entries).toHaveLength(3);
    expect(entries.every((entry) => entry.progress.status === "not_started")).toBe(true);
  });

  it("start moves a quest from not_started to in_progress and is idempotent", () => {
    const db = createDatabase(":memory:");
    const first = startQuest(db, "quest-greet-barista");
    expect(first).toEqual({ questId: "quest-greet-barista", status: "in_progress" });
    const second = startQuest(db, "quest-greet-barista");
    expect(second).toEqual({ questId: "quest-greet-barista", status: "in_progress" });
  });

  it("returns null for an unknown quest id", () => {
    const db = createDatabase(":memory:");
    expect(startQuest(db, "does-not-exist")).toBeNull();
    expect(completeQuest(db, "does-not-exist")).toBeNull();
  });

  it("full chain: complete quests -> xp/points update -> level up -> unlock effect", () => {
    const db = createDatabase(":memory:");

    const afterFirst = completeQuest(db, "quest-greet-barista");
    expect(afterFirst?.playerProgress).toMatchObject({ level: 1, xp: 40, points: 10 });
    expect(afterFirst?.newlyUnlocked).toEqual([]);

    // 40 + 60 = 100 xp, 刚好跨过 LEVEL_THRESHOLDS 里 level 2 的 minXp（100）
    const afterSecond = completeQuest(db, "quest-order-coffee");
    expect(afterSecond?.playerProgress).toMatchObject({ level: 2, xp: 100, points: 25 });
    expect(afterSecond?.newlyUnlocked).toEqual(["npc-barista-extra-line"]);
    expect(afterSecond?.playerProgress.unlocks).toContain("npc-barista-extra-line");

    const progress = getPlayerProgress(db);
    expect(progress.completedQuestIds.sort()).toEqual(["quest-greet-barista", "quest-order-coffee"].sort());
    expect(progress.unlocks).toEqual(["npc-barista-extra-line"]);
  });

  it("completing the same quest twice does not double-award xp/points", () => {
    const db = createDatabase(":memory:");
    completeQuest(db, "quest-greet-barista");
    const repeat = completeQuest(db, "quest-greet-barista");
    expect(repeat?.playerProgress.xp).toBe(40);
    expect(repeat?.playerProgress.points).toBe(10);
    expect(repeat?.newlyUnlocked).toEqual([]);
  });
});

describe("progressStore persistence across reconnects (real SQLite file)", () => {
  it("keeps xp/points/completed quests/unlocks after closing and reopening the same db file", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "quest-db-"));
    const dbPath = path.join(tmpDir, "progress.sqlite");

    try {
      const db1 = createDatabase(dbPath);
      completeQuest(db1, "quest-greet-barista");
      completeQuest(db1, "quest-order-coffee");
      const before = getPlayerProgress(db1);
      db1.close();

      expect(fs.existsSync(dbPath)).toBe(true);

      // 模拟服务重启：重新打开同一个文件，不复用内存里的 db 实例
      const db2 = createDatabase(dbPath);
      const after = getPlayerProgress(db2);
      db2.close();

      expect(after).toEqual(before);
      expect(after.level).toBe(2);
      expect(after.xp).toBe(100);
      expect(after.points).toBe(25);
      expect(after.completedQuestIds.sort()).toEqual(["quest-greet-barista", "quest-order-coffee"].sort());
      expect(after.unlocks).toEqual(["npc-barista-extra-line"]);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
