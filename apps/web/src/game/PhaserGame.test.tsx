import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { PhaserGame } from "./PhaserGame";

/**
 * 真实 Phaser.Game 在 jsdom 下无法完成 WebGL/Canvas 初始化，这里只还原本次修复相关的关键时序：
 * MainScene 要等 Phaser 的 READY 事件触发、SceneManager 把场景加入之后才能被 getScene() 找到
 * （见 node_modules/phaser/src/scene/SceneManager.js 的 bootQueue：它自己也是 game.events.once(READY, ...)
 * 触发的）。CHAR-001 的竞态就是：挂载时 talking=true 在 READY 之前调用 setTalking，被 getScene()
 * 恒为 undefined 静默吞掉，且没有任何补跑机制。
 */
const readyCallbacks: Array<() => void> = [];
let currentScene: { setTalking: ReturnType<typeof vi.fn> } | undefined;
const getSceneMock = vi.fn(() => currentScene);
const destroyMock = vi.fn();

vi.mock("phaser", () => {
  class FakeGame {
    events = {
      once: (_event: string, cb: () => void) => {
        readyCallbacks.push(cb);
      },
    };
    scene = { getScene: getSceneMock };
    destroy = destroyMock;
    constructor(_config: unknown) {}
  }
  return {
    default: {
      AUTO: "AUTO",
      Core: { Events: { READY: "ready" } },
      Game: FakeGame,
    },
  };
});

vi.mock("./MainScene", () => ({ MainScene: class {} }));

function fireReady() {
  readyCallbacks.splice(0).forEach((cb) => cb());
}

afterEach(() => {
  cleanup();
  readyCallbacks.length = 0;
  currentScene = undefined;
  getSceneMock.mockClear();
  destroyMock.mockClear();
});

describe("PhaserGame — talking 状态与 Phaser READY 时序对齐（回归 CHAR-001）", () => {
  it("挂载时 talking=true 但场景要等 READY 才存在：READY 前不调用 setTalking，READY 后补上最新值", () => {
    render(<PhaserGame talking={true} />);

    // READY 之前 getScene 恒为 undefined（场景还没被 SceneManager 加入），
    // [talking] 的 effect 虽然在挂载时跑过，但因为拿不到场景实例，从未真正调用到 setTalking。
    expect(currentScene).toBeUndefined();

    // 模拟 SceneManager 在真实 Phaser 内部于 READY 时把场景加入
    currentScene = { setTalking: vi.fn() };
    fireReady();

    expect(currentScene.setTalking).toHaveBeenCalledWith(true);
  });

  it("READY 之后 talking prop 变化会直接同步到当前场景", () => {
    currentScene = { setTalking: vi.fn() };
    const { rerender } = render(<PhaserGame talking={false} />);
    fireReady();
    currentScene.setTalking.mockClear();

    rerender(<PhaserGame talking={true} />);

    expect(currentScene.setTalking).toHaveBeenCalledWith(true);
  });

  it("卸载时销毁 Phaser.Game 实例", () => {
    const { unmount } = render(<PhaserGame talking={false} />);

    unmount();

    expect(destroyMock).toHaveBeenCalledWith(true);
  });
});
