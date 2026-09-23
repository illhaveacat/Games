import type { NextFunction, Request, Response } from "express";

/**
 * 手写的最小 CORS 中间件，不引入 `cors` 这个 npm 包——加新依赖要动根 package-lock.json，
 * 那是 contract-owner 独占路径（参见 CHORE-001/002/003 的先例：dev-worker 遇到需要新依赖的场景
 * 一律改建 CHORE 任务而不是越界自己改锁文件）。这里的需求很简单（允许配置的来源、GET/POST、
 * 处理 OPTIONS 预检），手写比引入一整个依赖更轻量。
 *
 * 没有设置 Access-Control-Allow-Credentials：当前接口不用 cookie/凭证，不需要这个头。
 * 以后如果要支持凭证（比如登录态），必须同时满足两个条件——具体的来源白名单（不能是 "*"，
 * 浏览器规范本身也禁止 credentials 配 "*"）+ 显式加上 Access-Control-Allow-Credentials: true，
 * 不能只改这一个中间件里的某一处就算完事。
 */
export type AllowedOrigins = "*" | string[];

function stripTrailingSlash(origin: string): string {
  return origin.endsWith("/") ? origin.slice(0, -1) : origin;
}

/**
 * 把 CORS_ALLOWED_ORIGINS 环境变量（逗号分隔的来源列表）解析成允许的来源集合。
 * **未设置或空字符串 = 不放行任何跨源来源**（返回空数组）——这个 API 会修改持久化的玩家进度
 * （POST /api/quests/:id/progress 发 xp/points、标记任务完成）也会读出玩家数据（GET /api/progress），
 * 不是"公开只读"接口，默认值必须是安全的，不能默认 "*"。同源访问（含 apps/web 的 vite dev proxy，
 * 那是服务端到服务端的转发，不受浏览器 CORS 约束）完全不受这个默认值影响。
 * 只有显式把这个环境变量设成字面量 "*" 才会通配任意来源，并在此时打一条 warn 日志提醒这是主动选择。
 */
export function resolveAllowedOrigins(envValue: string | undefined): AllowedOrigins {
  const trimmed = (envValue ?? "").trim();
  if (trimmed === "") return [];
  if (trimmed === "*") {
    console.warn(
      "[cors] CORS_ALLOWED_ORIGINS=* ：显式允许任意来源跨源访问 /api/**（含会改写玩家进度的写接口）。" +
        "确认这是有意为之，而不是忘记配置具体域名。",
    );
    return "*";
  }
  return trimmed
    .split(",")
    .map((origin) => stripTrailingSlash(origin.trim()))
    .filter((origin) => origin.length > 0);
}

function isOriginAllowed(origin: string | undefined, allowedOrigins: AllowedOrigins): boolean {
  if (allowedOrigins === "*") return true;
  if (origin === undefined) return false;
  // 两边都做一次去尾部斜杠的归一化：resolveAllowedOrigins 已经会处理配置项，
  // 但这里防御性地再做一次，避免有人直接构造 corsAllowedOrigins（绕开 resolveAllowedOrigins）时踩坑。
  const normalizedOrigin = stripTrailingSlash(origin);
  return allowedOrigins.some((allowed) => stripTrailingSlash(allowed) === normalizedOrigin);
}

/**
 * 生产环境可用的 CORS 支持：不依赖 apps/web 的 vite dev 开发态代理，浏览器直接跨源访问
 * apps/server 的接口也能正常拿到响应（预检 OPTIONS 请求直接在这里短路返回 204）。
 * 默认（未配置 CORS_ALLOWED_ORIGINS）不放行任何跨源来源，见 resolveAllowedOrigins 的注释。
 */
export function createCorsMiddleware(allowedOrigins: AllowedOrigins) {
  return function cors(req: Request, res: Response, next: NextFunction): void {
    const origin = req.headers.origin;

    if (isOriginAllowed(origin, allowedOrigins)) {
      res.setHeader("Access-Control-Allow-Origin", allowedOrigins === "*" ? "*" : String(origin));
      if (allowedOrigins !== "*") {
        res.vary("Origin");
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
