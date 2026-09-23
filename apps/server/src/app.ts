import express, { type Express } from "express";
import { dialogueRouter } from "./routes/dialogue.js";
import { createQuestsRouter } from "./routes/quests.js";
import { createDatabase } from "./progress/db.js";

export interface CreateAppOptions {
  /** SQLite 文件路径；默认 ":memory:"（测试用）。生产入口（index.ts）会显式传真实文件路径以落盘持久化。 */
  dbPath?: string;
}

export function createApp(options: CreateAppOptions = {}): Express {
  const db = createDatabase(options.dbPath ?? ":memory:");

  const app = express();
  app.use(express.json());
  app.use("/api", dialogueRouter);
  app.use("/api", createQuestsRouter(db));
  return app;
}
