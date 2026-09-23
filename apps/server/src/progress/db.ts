import type { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

// 用 process.getBuiltinModule 而不是静态 `import ... from "node:sqlite"`：
// 这个仓库的 vite/vitest 版本（CHORE-001 记录过不强推大版本升级）内置的 Node 内置模块清单
// 还不认识 node:sqlite，静态 import 会被 vite 误当成裸模块 "sqlite" 解析失败。
// process.getBuiltinModule 是运行时函数调用，不经过 vite 的 import 解析管线，dev/build/test 都能用。
type BuiltinModuleGetter = (id: string) => object | undefined;

/**
 * 取出 node:sqlite 内置模块，取不到就抛出带版本说明的明确错误（而不是让调用方在
 * `new sqlite.DatabaseSync` 那行看到一个不知所云的 TypeError）。
 * 独立导出成函数是为了能在测试里注入假的 getter，覆盖"模块不存在/未启用"这条路径
 * ——没法在同一个 Node 进程里真的切换版本或去掉 --experimental-sqlite 来复现。
 */
export function resolveSqliteModule(
  getBuiltinModule: BuiltinModuleGetter | undefined = typeof process.getBuiltinModule === "function"
    ? process.getBuiltinModule.bind(process)
    : undefined,
): typeof import("node:sqlite") {
  const sqlite = getBuiltinModule?.("node:sqlite");
  if (!sqlite) {
    throw new Error(
      `node:sqlite 不可用（当前 Node ${process.version}）。这个 workspace 需要 Node >=22.13.0（22.5.0-22.12.x ` +
        "虽然内置了这个模块，但默认在 --experimental-sqlite 标志后面，本项目没有加这个标志；低于 22.5.0 则完全没有 " +
        "node:sqlite）。请升级 Node 到 22.13.0+（或 23.x 线的 23.4.0+）。",
    );
  }
  return sqlite as typeof import("node:sqlite");
}

const sqlite = resolveSqliteModule();

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

/**
 * 把一段读写包在一个事务里：要么全部生效要么全部回滚。
 * 用于 completeQuest 这种"检查状态 + 加分 + 标记完成"必须原子发生的操作——
 * 否则进程在两次写之间崩溃，会留下"已发奖但任务未标完成"的中间状态，重试就会重复发奖。
 */
export function withTransaction<T>(db: DatabaseSync, fn: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

/** apps/server/data/progress.sqlite，相对 db.ts 自身位置计算，dev（src）和 build（dist）下都指向同一目录。 */
export function resolveDefaultDbPath(): string {
  return path.join(import.meta.dirname, "..", "..", "data", "progress.sqlite");
}
