import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";

// 所有测试都显式传 dbPath: ":memory:"——createApp() 的默认值是真实落盘文件
// （见 app.ts 的 CreateAppOptions 注释），测试必须显式选择内存库来隔离/避免碰真实数据文件。

describe("GET /api/quests", () => {
  it("returns the quest catalog with not_started progress by default", async () => {
    const app = createApp({ dbPath: ":memory:" });
    const res = await request(app).get("/api/quests");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(3);
    for (const entry of res.body) {
      expect(entry.quest).toHaveProperty("id");
      expect(entry.quest).toHaveProperty("rewardXp");
      expect(entry.progress).toMatchObject({ questId: entry.quest.id, status: "not_started" });
    }
  });
});

describe("GET /api/progress", () => {
  it("returns level 1 / xp 0 / points 0 for a fresh player", async () => {
    const app = createApp({ dbPath: ":memory:" });
    const res = await request(app).get("/api/progress");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ level: 1, xp: 0, points: 0, completedQuestIds: [], unlocks: [] });
  });
});

describe("POST /api/quests/:id/progress", () => {
  it("returns 404 (not 500) for an unknown quest id", async () => {
    const app = createApp({ dbPath: ":memory:" });
    const res = await request(app).post("/api/quests/does-not-exist/progress").send({ action: "complete" });
    expect(res.status).toBe(404);
  });

  it("returns 400 (not a silent complete) for a missing action on a missing/malformed body", async () => {
    const app = createApp({ dbPath: ":memory:" });
    const res = await request(app).post("/api/quests/quest-greet-barista/progress").send();
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("invalid_action");

    // 畸形输入绝不能变成发奖
    const progress = await request(app).get("/api/progress");
    expect(progress.body.xp).toBe(0);
    expect(progress.body.completedQuestIds).toEqual([]);
  });

  it("returns 400 for an unrecognized action string instead of silently completing", async () => {
    const app = createApp({ dbPath: ":memory:" });
    const res = await request(app)
      .post("/api/quests/quest-greet-barista/progress")
      .send({ action: "Start" }); // 大小写拼错，不等于合法的 "start"
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("invalid_action");

    const progress = await request(app).get("/api/progress");
    expect(progress.body.xp).toBe(0);
    expect(progress.body.completedQuestIds).toEqual([]);
  });

  it("start moves a quest to in_progress without granting reward", async () => {
    const app = createApp({ dbPath: ":memory:" });
    const res = await request(app)
      .post("/api/quests/quest-greet-barista/progress")
      .send({ action: "start" });
    expect(res.status).toBe(200);
    expect(res.body.progress).toEqual({ questId: "quest-greet-barista", status: "in_progress" });

    const progress = await request(app).get("/api/progress");
    expect(progress.body.xp).toBe(0);
  });

  it("full chain: complete quest -> quests list reflects status -> progress reflects xp/points/level/unlock", async () => {
    const app = createApp({ dbPath: ":memory:" });

    const first = await request(app)
      .post("/api/quests/quest-greet-barista/progress")
      .send({ action: "complete" });
    expect(first.status).toBe(200);
    expect(first.body.progress).toEqual({ questId: "quest-greet-barista", status: "completed" });
    expect(first.body.playerProgress).toMatchObject({ level: 1, xp: 40, points: 10 });

    const second = await request(app)
      .post("/api/quests/quest-order-coffee/progress")
      .send({ action: "complete" });
    expect(second.status).toBe(200);
    expect(second.body.playerProgress).toMatchObject({ level: 2, xp: 100, points: 25 });
    expect(second.body.newlyUnlocked).toEqual(["npc-barista-extra-line"]);

    const questsList = await request(app).get("/api/quests");
    const greetEntry = questsList.body.find((e: { quest: { id: string } }) => e.quest.id === "quest-greet-barista");
    const orderEntry = questsList.body.find((e: { quest: { id: string } }) => e.quest.id === "quest-order-coffee");
    expect(greetEntry.progress.status).toBe("completed");
    expect(orderEntry.progress.status).toBe("completed");

    const progress = await request(app).get("/api/progress");
    expect(progress.body).toMatchObject({ level: 2, xp: 100, points: 25 });
    expect(progress.body.completedQuestIds.sort()).toEqual(
      ["quest-greet-barista", "quest-order-coffee"].sort(),
    );
    expect(progress.body.unlocks).toContain("npc-barista-extra-line");
  });

  it("completing the same quest twice does not double-award xp/points", async () => {
    const app = createApp({ dbPath: ":memory:" });
    await request(app).post("/api/quests/quest-greet-barista/progress").send({ action: "complete" });
    const res = await request(app).post("/api/quests/quest-greet-barista/progress").send({ action: "complete" });
    expect(res.status).toBe(200);
    expect(res.body.playerProgress.xp).toBe(40);
    expect(res.body.newlyUnlocked).toEqual([]);
  });
});
