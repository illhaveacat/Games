import type { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

// 用 process.getBuiltinModule 而不是静态 `import ... from "node:sqlite"`：
// 这个仓库的 vite/vitest 版本（CHORE-001 记录过不强推大版本升级）内置的 Node 内置模块清单
// 还不认识 node:sqlite，静态 import 会被 vite 误当成裸模块 "sqlite" 解析失败。
// process.getBuiltinModule 是运行时函数调用，不经过 vite 的 import 解析管线，dev/build/test 都能用。
const sqlite = process.getBuiltinModule("node:sqlite");

/**
 * player_progress / quest_progress 用 SQLite 落盘持久化，不是内存变量：
 * 同一 dbPath 重新 new DatabaseSync 仍能读到之前写入的数据（见 progressStore 的持久化测试）。
 */
export function createDatabase(dbPath: string): DatabaseSync {
  if (dbPath !== ":memory:") {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }
  const db = new sqlite.DatabaseSync(dbPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS player_progress (
      player_id TEXT PRIMARY KEY,
      xp INTEGER NOT NULL DEFAULT 0,
      points INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS quest_progress (
      player_id TEXT NOT NULL,
      quest_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'not_started',
      PRIMARY KEY (player_id, quest_id)
    );
  `);
  return db;
}

/** apps/server/data/progress.sqlite，相对 db.ts 自身位置计算，dev（src）和 build（dist）下都指向同一目录。 */
export function resolveDefaultDbPath(): string {
  return path.join(import.meta.dirname, "..", "..", "data", "progress.sqlite");
}
