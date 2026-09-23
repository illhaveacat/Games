import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";

describe("POST /api/dialogue", () => {
  // 这个测试不碰任务/进度逻辑，但 createApp 总会建一个 db；显式传 ":memory:" 避免碰真实数据文件。
  const app = createApp({ dbPath: ":memory:" });

  it("returns a rule-based reply for a known npc matching a keyword", async () => {
    const res = await request(app)
      .post("/api/dialogue")
      .send({ npcId: "npc-mira", playerText: "Hello there!" });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ speakerId: "npc-mira" });
    expect(typeof res.body.text).toBe("string");
    expect(res.body.text.length).toBeGreaterThan(0);
    expect(res.body.text.toLowerCase()).toContain("mira");
    expect(typeof res.body.timestamp).toBe("number");
  });

  it("returns a different rule reply for a different keyword on the same npc", async () => {
    const res = await request(app)
      .post("/api/dialogue")
      .send({ npcId: "npc-mira", playerText: "bye!" });

    expect(res.status).toBe(200);
    expect(res.body.text.toLowerCase()).toContain("bye");
  });

  it("returns a fallback reply (not 500) for an unknown npcId", async () => {
    const res = await request(app)
      .post("/api/dialogue")
      .send({ npcId: "npc-does-not-exist", playerText: "Hello" });

    expect(res.status).toBe(200);
    expect(res.body.speakerId).toBe("npc-does-not-exist");
    expect(res.body.text.length).toBeGreaterThan(0);
  });

  it("returns a fallback reply (not 500) for unrecognized input to a known npc", async () => {
    const res = await request(app)
      .post("/api/dialogue")
      .send({ npcId: "npc-mira", playerText: "asdkjqwe zxcv 12345" });

    expect(res.status).toBe(200);
    expect(res.body.speakerId).toBe("npc-mira");
    expect(res.body.text.length).toBeGreaterThan(0);
  });

  it("never returns 500, even for a missing/malformed body", async () => {
    const res = await request(app).post("/api/dialogue").send({});

    expect(res.status).not.toBe(500);
    expect(res.status).toBe(200);
    expect(res.body.text.length).toBeGreaterThan(0);
  });
});

describe("POST /api/dialogue with the cafe NPC (npc-barista) drives the quest chain end-to-end", () => {
  it("completing the quest chain through dialogue is reflected in GET /api/quests and GET /api/progress", async () => {
    const app = createApp({ dbPath: ":memory:" });

    const greet = await request(app)
      .post("/api/dialogue")
      .send({ npcId: "npc-barista", playerText: "Hi! I'm new in town." });
    expect(greet.status).toBe(200);
    expect(greet.body.speakerId).toBe("npc-barista");

    await request(app).post("/api/dialogue").send({ npcId: "npc-barista", playerText: "coffee and a pastry" });
    await request(app).post("/api/dialogue").send({ npcId: "npc-barista", playerText: "no sugar, to go" });

    const progress = await request(app).get("/api/progress");
    expect(progress.body).toMatchObject({ level: 2, xp: 180, points: 45 });
    expect(progress.body.completedQuestIds.sort()).toEqual(
      ["quest-greet-barista", "quest-order-coffee", "quest-answer-followup"].sort(),
    );
    expect(progress.body.unlocks).toContain("npc-barista-extra-line");

    const quests = await request(app).get("/api/quests");
    expect(quests.body.every((entry: { progress: { status: string } }) => entry.progress.status === "completed")).toBe(
      true,
    );
  });
});
