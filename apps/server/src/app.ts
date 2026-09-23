import express, { type Express } from "express";
import { createDialogueRouter } from "./routes/dialogue.js";
import { createQuestsRouter } from "./routes/quests.js";
import { createDatabase, resolveDefaultDbPath } from "./progress/db.js";
import { createCorsMiddleware, resolveAllowedOrigins, type AllowedOrigins } from "./middleware/cors.js";

export interface CreateAppOptions {
  /**
   * SQLite 文件路径；默认是真实落盘文件（resolveDefaultDbPath()），不是 ":memory:"——
   * 生产环境如果漏传会静默丢数据，宁可默认安全（落盘）。测试需要隔离/加速时必须显式传 ":memory:"。
   */
  dbPath?: string;
  /** 允许跨源访问的来源；默认读 CORS_ALLOWED_ORIGINS 环境变量（未设置则不放行任何跨源来源，安全默认值）。 */
  corsAllowedOrigins?: AllowedOrigins;
}

export function createApp(options: CreateAppOptions = {}): Express {
  const db = createDatabase(options.dbPath ?? resolveDefaultDbPath());
  const corsAllowedOrigins = options.corsAllowedOrigins ?? resolveAllowedOrigins(process.env.CORS_ALLOWED_ORIGINS);

  const app = express();
  app.use(createCorsMiddleware(corsAllowedOrigins));
  app.use(express.json());
  app.use("/api", createDialogueRouter(db));
  app.use("/api", createQuestsRouter(db));
  return app;
}
