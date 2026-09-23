import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";

describe("POST /api/dialogue", () => {
  const app = createApp();

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
