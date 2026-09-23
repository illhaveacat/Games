import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "./app.js";

// 端到端验证 createApp 真的把 CORS 中间件接进了整个应用（不只是单独测中间件本身），
// 对应 FIX-001 验收条件 1："apps/server 有 CORS 中间件配置"。
describe("createApp CORS wiring", () => {
  it("POST /api/dialogue succeeds cross-origin and carries CORS headers when the origin is on the configured allow-list", async () => {
    const app = createApp({ dbPath: ":memory:", corsAllowedOrigins: ["http://localhost:4173"] });

    const res = await request(app)
      .post("/api/dialogue")
      .set("Origin", "http://localhost:4173")
      .send({ npcId: "npc-mira", playerText: "hello" });

    expect(res.status).toBe(200);
    expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:4173");
  });

  it("an OPTIONS preflight for /api/quests/:id/progress gets a 204 with CORS headers before hitting the route", async () => {
    const app = createApp({ dbPath: ":memory:", corsAllowedOrigins: "*" });

    const res = await request(app)
      .options("/api/quests/quest-greet-barista/progress")
      .set("Origin", "http://localhost:4173")
      .set("Access-Control-Request-Method", "POST");

    expect(res.status).toBe(204);
    expect(res.headers["access-control-allow-origin"]).toBe("*");
  });

  it("defaults to '*' (any origin allowed) when corsAllowedOrigins isn't passed and CORS_ALLOWED_ORIGINS isn't set", async () => {
    const previous = process.env.CORS_ALLOWED_ORIGINS;
    delete process.env.CORS_ALLOWED_ORIGINS;
    try {
      const app = createApp({ dbPath: ":memory:" });
      const res = await request(app).get("/api/progress").set("Origin", "http://some-random-origin.example");
      expect(res.headers["access-control-allow-origin"]).toBe("*");
    } finally {
      if (previous === undefined) delete process.env.CORS_ALLOWED_ORIGINS;
      else process.env.CORS_ALLOWED_ORIGINS = previous;
    }
  });
});
