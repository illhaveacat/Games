import express, { type Express } from "express";
import { dialogueRouter } from "./routes/dialogue.js";
import { createQuestsRouter } from "./routes/quests.js";
import { createDatabase, resolveDefaultDbPath } from "./progress/db.js";

export interface CreateAppOptions {
  /**
   * SQLite 文件路径；默认是真实落盘文件（resolveDefaultDbPath()），不是 ":memory:"——
   * 生产环境如果漏传会静默丢数据，宁可默认安全（落盘）。测试需要隔离/加速时必须显式传 ":memory:"。
   */
  dbPath?: string;
}

export function createApp(options: CreateAppOptions = {}): Express {
  const db = createDatabase(options.dbPath ?? resolveDefaultDbPath());

  const app = express();
  app.use(express.json());
  app.use("/api", dialogueRouter);
  app.use("/api", createQuestsRouter(db));
  return app;
}
