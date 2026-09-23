import { describe, expect, it } from "vitest";
import request from "supertest";
import express from "express";
import { createCorsMiddleware, resolveAllowedOrigins } from "./cors.js";

describe("resolveAllowedOrigins", () => {
  it("returns '*' when the env var is unset, empty, or literally '*'", () => {
    expect(resolveAllowedOrigins(undefined)).toBe("*");
    expect(resolveAllowedOrigins("")).toBe("*");
    expect(resolveAllowedOrigins("   ")).toBe("*");
    expect(resolveAllowedOrigins("*")).toBe("*");
  });

  it("parses a comma-separated list, trimming whitespace and dropping empties", () => {
    expect(resolveAllowedOrigins("http://a.com, http://b.com ,,http://c.com")).toEqual([
      "http://a.com",
      "http://b.com",
      "http://c.com",
    ]);
  });
});

function buildTestApp(allowedOrigins: Parameters<typeof createCorsMiddleware>[0]) {
  const app = express();
  app.use(createCorsMiddleware(allowedOrigins));
  app.get("/ping", (_req, res) => res.status(200).json({ ok: true }));
  return app;
}

describe("createCorsMiddleware", () => {
  it("with '*': reflects Access-Control-Allow-Origin: * for any request, no Vary header", async () => {
    const app = buildTestApp("*");
    const res = await request(app).get("/ping").set("Origin", "http://anywhere.example");
    expect(res.status).toBe(200);
    expect(res.headers["access-control-allow-origin"]).toBe("*");
    expect(res.headers["vary"]).toBeUndefined();
  });

  it("with an explicit allow-list: echoes back the Origin header when it's on the list, and sets Vary: Origin", async () => {
    const app = buildTestApp(["http://good.example"]);
    const res = await request(app).get("/ping").set("Origin", "http://good.example");
    expect(res.status).toBe(200);
    expect(res.headers["access-control-allow-origin"]).toBe("http://good.example");
    expect(res.headers["vary"]).toBe("Origin");
  });

  it("with an explicit allow-list: does not set Access-Control-Allow-Origin for an origin not on the list", async () => {
    const app = buildTestApp(["http://good.example"]);
    const res = await request(app).get("/ping").set("Origin", "http://evil.example");
    expect(res.status).toBe(200); // 请求本身仍然处理（服务端不阻断），浏览器侧靠缺失的响应头自己拦截
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("short-circuits an OPTIONS preflight request with 204 and the CORS headers, without reaching downstream routes", async () => {
    const app = buildTestApp("*");
    const res = await request(app).options("/ping").set("Origin", "http://anywhere.example");
    expect(res.status).toBe(204);
    expect(res.headers["access-control-allow-origin"]).toBe("*");
    expect(res.headers["access-control-allow-methods"]).toContain("POST");
    expect(res.headers["access-control-allow-headers"]).toContain("Content-Type");
  });
});
