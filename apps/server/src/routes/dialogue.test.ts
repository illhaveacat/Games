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

  it("DIALOG-001: the chain can be walked with the newly supported phrasings, with in-context follow-ups when not understood", async () => {
    const app = createApp({ dbPath: ":memory:" });
    const say = async (playerText: string) => {
      const res = await request(app).post("/api/dialogue").send({ npcId: "npc-barista", playerText });
      expect(res.status).toBe(200);
      expect(res.body.speakerId).toBe("npc-barista");
      return res.body.text as string;
    };
    const completed = async () => ((await request(app).get("/api/progress")).body.completedQuestIds as string[]).length;

    // 第 1 步：点单词汇不算打招呼；没听懂 -> 邀请打招呼
    expect((await say("Can I get a latte?")).toLowerCase()).toContain("hello");
    expect(await completed()).toBe(0);
    expect((await say("Good morning!")).toLowerCase()).toContain("welcome");
    expect(await completed()).toBe(1);

    // 第 2 步：'here' 不算点单；提问不算点单；没听懂 -> 再问想要什么
    expect((await say("For here.")).toLowerCase()).toContain("what can i get");
    expect((await say("Is there tea?")).toLowerCase()).toContain("what can i get");
    expect(await completed()).toBe(1);
    const orderReply = (await say("Can I get a cappuccino and a cookie, please?")).toLowerCase();
    expect(orderReply).toContain("one cappuccino and a cookie");
    expect(orderReply).toContain("got it");
    expect(await completed()).toBe(2);

    // 第 3 步：没听懂 -> 再问要不要糖、堂食还是打包；'No, thanks.' 算回答
    const reask = (await say("Hmm, let me think")).toLowerCase();
    expect(reask).toContain("sugar");
    expect(reask).toContain("for here");
    expect(reask).toContain("to go");
    expect(await completed()).toBe(2);
    expect((await say("No, thanks.")).toLowerCase()).toContain("perfect");
    expect(await completed()).toBe(3);

    const progress = await request(app).get("/api/progress");
    expect(progress.body).toMatchObject({ level: 2, xp: 180, points: 45 });
  });

  it("DIALOG-001: STAGE-001's negation counter-examples still do not advance the order step over HTTP (straight and curly apostrophes)", async () => {
    for (const apostrophe of ["'", "’"]) {
      const app = createApp({ dbPath: ":memory:" });
      await request(app).post("/api/dialogue").send({ npcId: "npc-barista", playerText: "hello" });

      const res = await request(app)
        .post("/api/dialogue")
        .send({ npcId: "npc-barista", playerText: `I don${apostrophe}t want coffee, is there tea?` });

      expect(res.body.text.toLowerCase()).not.toContain("got it");
      const progress = await request(app).get("/api/progress");
      expect(progress.body.xp).toBe(40);
    }
  });

  it("DIALOG-002: the barista's reply names what the player actually ordered, for several combinations", async () => {
    const combos: Array<[string, string, string]> = [
      ["Can I get a latte and a sandwich, please?", "latte", "sandwich"],
      ["I'd like a tea and a cake.", "tea", "cake"],
      ["I'll have a cappuccino and a cookie", "cappuccino", "cookie"],
      ["Could I get an americano and a croissant?", "americano", "croissant"],
    ];

    for (const [playerText, drink, pastry] of combos) {
      const app = createApp({ dbPath: ":memory:" });
      await request(app).post("/api/dialogue").send({ npcId: "npc-barista", playerText: "hello" });

      const res = await request(app).post("/api/dialogue").send({ npcId: "npc-barista", playerText });

      expect(res.status).toBe(200);
      expect(res.body.text.toLowerCase()).toContain(`one ${drink} and a ${pastry}`);

      // 第 3 步不受影响：糖/堂食打包的追问和推进照旧
      const followup = await request(app).post("/api/dialogue").send({ npcId: "npc-barista", playerText: "no sugar, to go" });
      expect(followup.body.text.toLowerCase()).toContain("perfect");
      const progress = await request(app).get("/api/progress");
      expect(progress.body.completedQuestIds.sort()).toEqual(
        ["quest-greet-barista", "quest-order-coffee", "quest-answer-followup"].sort(),
      );
    }
  });

  it("DIALOG-002: falls back to the generic 'coffee'/'pastry' names when the player doesn't name a specific item", async () => {
    const app = createApp({ dbPath: ":memory:" });
    await request(app).post("/api/dialogue").send({ npcId: "npc-barista", playerText: "hello" });

    const res = await request(app)
      .post("/api/dialogue")
      .send({ npcId: "npc-barista", playerText: "Can I get a hot chocolate?" });

    expect(res.status).toBe(200);
    expect(res.body.text.toLowerCase()).toContain("one coffee and a pastry");
  });
});

describe("POST /api/dialogue 超长输入（DIALOG-001 返工）", () => {
  it("接近 express.json 默认上限的 100 KB playerText：仍返回 200 和正常回复，并且很快", async () => {
    const app = createApp({ dbPath: ":memory:" });
    await request(app).post("/api/dialogue").send({ npcId: "npc-barista", playerText: "hello" });

    for (const unit of ["is there tea ", "no tea ", "tea "]) {
      const playerText = unit.repeat(Math.floor(99_000 / unit.length));
      const start = performance.now();
      const res = await request(app).post("/api/dialogue").send({ npcId: "npc-barista", playerText });
      const ms = performance.now() - start;

      expect(res.status).toBe(200);
      expect(res.body.speakerId).toBe("npc-barista");
      expect(res.body.text.length).toBeGreaterThan(0);
      expect(ms).toBeLessThan(1500);
    }
  });
});
