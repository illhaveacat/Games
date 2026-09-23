import type { NextFunction, Request, Response } from "express";

/**
 * 手写的最小 CORS 中间件，不引入 `cors` 这个 npm 包——加新依赖要动根 package-lock.json，
 * 那是 contract-owner 独占路径（参见 CHORE-001/002/003 的先例：dev-worker 遇到需要新依赖的场景
 * 一律改建 CHORE 任务而不是越界自己改锁文件）。这里的需求很简单（允许配置的来源、GET/POST、
 * 处理 OPTIONS 预检），手写比引入一整个依赖更轻量。
 */
export type AllowedOrigins = "*" | string[];

/**
 * 把 CORS_ALLOWED_ORIGINS 环境变量（逗号分隔的来源列表）解析成允许的来源集合。
 * 未设置、空字符串、或字面量 "*" 都表示允许任意来源（这是一个不需要 cookie/凭证的公开只读 API，
 * 允许任意来源访问是可接受的默认值；生产部署如果需要收紧，设置这个环境变量为具体的域名列表）。
 */
export function resolveAllowedOrigins(envValue: string | undefined): AllowedOrigins {
  const trimmed = (envValue ?? "").trim();
  if (trimmed === "" || trimmed === "*") return "*";
  return trimmed
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

function isOriginAllowed(origin: string | undefined, allowedOrigins: AllowedOrigins): boolean {
  if (allowedOrigins === "*") return true;
  return origin !== undefined && allowedOrigins.includes(origin);
}

/**
 * 生产环境可用的 CORS 支持：不依赖 apps/web 的 vite dev 开发态代理，浏览器直接跨源访问
 * apps/server 的接口也能正常拿到响应（预检 OPTIONS 请求直接在这里短路返回 204）。
 */
export function createCorsMiddleware(allowedOrigins: AllowedOrigins) {
  return function cors(req: Request, res: Response, next: NextFunction): void {
    const origin = req.headers.origin;

    if (isOriginAllowed(origin, allowedOrigins)) {
      res.setHeader("Access-Control-Allow-Origin", allowedOrigins === "*" ? "*" : String(origin));
      if (allowedOrigins !== "*") {
        res.setHeader("Vary", "Origin");
      }
    }

    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }

    next();
  };
}
