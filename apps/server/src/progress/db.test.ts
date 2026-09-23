import { describe, expect, it } from "vitest";
import { resolveSqliteModule } from "./db.js";

// 没法在同一个 Node 进程里真的切换版本或去掉 --experimental-sqlite 来复现
// "Node 22.5.0-22.12.x 未加 --experimental-sqlite" 或 "Node <22.5.0" 这两种真实情况，
// 所以用可注入的 getter 模拟 process.getBuiltinModule 在这些版本上的实际行为
// （前者返回 undefined，后者这个函数根本不存在）来测错误路径本身是否被触发、信息是否清楚。
describe("resolveSqliteModule", () => {
  it("returns the real node:sqlite module when the getter provides it (this Node version)", () => {
    const sqlite = resolveSqliteModule();
    expect(typeof sqlite.DatabaseSync).toBe("function");
  });

  it("throws a clear, version-specific error when the getter returns undefined (e.g. Node 22.5-22.12 without --experimental-sqlite)", () => {
    expect(() => resolveSqliteModule(() => undefined)).toThrow(/node:sqlite 不可用/);
    expect(() => resolveSqliteModule(() => undefined)).toThrow(/22\.13\.0/);
  });

  it("throws the same clear error when process.getBuiltinModule doesn't exist at all (Node <22.3)", () => {
    // 注意：显式传 undefined 会触发参数默认值（等价于不传参数，落回真实 process.getBuiltinModule），
    // 所以这里用 null 绕开默认值替换，模拟"根本没有这个 getter 函数"的场景（optional chaining 对
    // null/undefined 处理一致，行为等价于 getBuiltinModule 真的不存在）。
    expect(() => resolveSqliteModule(null as unknown as undefined)).toThrow(/node:sqlite 不可用/);
  });
});
