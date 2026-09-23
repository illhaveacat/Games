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

  it("rolls back atomically if a crash happens mid-transaction (no partial 'awarded but not completed' state)", () => {
    const db = createDatabase(":memory:");
    const originalPrepare = db.prepare.bind(db);

    // 关键：注入点必须在 UPDATE player_progress 已经真正执行之后，测试才有意义——
    // 否则 UPDATE 还没跑过，没有事务也会是同样的结果（xp 仍是 0），测不出原子性。
    // 所以让 setQuestStatus 的 upsert（"INSERT INTO quest_progress ..."，发生在加分之后）抛错，
    // 模拟"xp/points 已经写完、正准备标记任务完成"那一刻崩溃。
    db.prepare = (sql: string) => {
      if (sql.startsWith("INSERT INTO quest_progress")) {
        throw new Error("simulated crash mid-transaction");
      }
      return originalPrepare(sql);
    };

    expect(() => completeQuest(db, "quest-greet-barista")).toThrow("simulated crash mid-transaction");

    db.prepare = originalPrepare;

    // 事务整体回滚：既没有加到经验/积分，任务状态也还是 not_started，不是"已发奖但未完成"的中间态
    const progress = getPlayerProgress(db);
    expect(progress.xp).toBe(0);
    expect(progress.points).toBe(0);
    expect(progress.completedQuestIds).toEqual([]);
    const entry = listQuestsWithProgress(db).find((e) => e.quest.id === "quest-greet-barista");
    expect(entry?.progress.status).toBe("not_started");

    // 回滚之后同一个 db 连接依然可用，重试能正常成功发奖（不是被锁死/污染的连接）
    const retry = completeQuest(db, "quest-greet-barista");
    expect(retry?.playerProgress).toMatchObject({ level: 1, xp: 40, points: 10 });
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
