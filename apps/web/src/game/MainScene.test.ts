import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_NPC } from "../dialogue/welcomeMessage";

vi.mock("phaser", () => {
  class FakeScene {
    constructor(_key: string) {}
  }
  return {
    default: {
      Scene: FakeScene,
      Scenes: { Events: { SHUTDOWN: "shutdown", DESTROY: "destroy" } },
    },
  };
});

const character = { playIdle: vi.fn(), playTalking: vi.fn(), destroy: vi.fn() };
const background = { destroy: vi.fn() };
const nameTag = { x: 123, y: 45 };
const createCafeSceneArt = vi.fn((_scene: unknown) => ({ character, background, nameTag }));
vi.mock("./sceneArt", () => ({ createCafeSceneArt: (scene: unknown) => createCafeSceneArt(scene) }));

import { MainScene } from "./MainScene";

function makeScene() {
  const handlers = new Map<string, () => void>();
  const text = { setOrigin: vi.fn().mockReturnThis(), setDepth: vi.fn().mockReturnThis() };
  const fake = {
    cameras: { main: { setBackgroundColor: vi.fn() } },
    add: { text: vi.fn(() => text) },
    events: { once: vi.fn((event: string, cb: () => void) => handlers.set(event, cb)) },
  };
  const scene = new MainScene();
  Object.assign(scene, fake);
  return { scene, fake, text, emit: (event: string) => handlers.get(event)?.() };
}

beforeEach(() => {
  character.playIdle.mockClear();
  character.playTalking.mockClear();
  character.destroy.mockClear();
  background.destroy.mockClear();
  createCafeSceneArt.mockClear();
});

describe("MainScene — 只通过 createCafeSceneArt 这一个接口使用美术模块", () => {
  it("create() 调用一次 createCafeSceneArt，并把 NPC 名字标签放在美术给出的位置", () => {
    const { scene, fake, text } = makeScene();

    scene.create();

    expect(createCafeSceneArt).toHaveBeenCalledTimes(1);
    expect(createCafeSceneArt).toHaveBeenCalledWith(scene);
    expect(fake.add.text).toHaveBeenCalledWith(nameTag.x, nameTag.y, DEFAULT_NPC.name, expect.any(Object));
    expect(text.setDepth).toHaveBeenCalled();
  });
});

describe("MainScene — 说话状态切换（兼容 CHAR-001 的状态机与场景就绪前重放）", () => {
  it("create() 之后 setTalking(true/false) 分别驱动角色进入说话/待机", () => {
    const { scene } = makeScene();
    scene.create();

    scene.setTalking(true);
    expect(character.playTalking).toHaveBeenCalledTimes(1);

    scene.setTalking(false);
    expect(character.playIdle).toHaveBeenCalledTimes(1);
  });

  it("重复设置同一状态不会重复触发动画", () => {
    const { scene } = makeScene();
    scene.create();

    scene.setTalking(true);
    scene.setTalking(true);

    expect(character.playTalking).toHaveBeenCalledTimes(1);
  });

  it("create() 完成前调用过 setTalking(true)：create() 后自动重放，角色直接进入说话状态", () => {
    const { scene } = makeScene();

    scene.setTalking(true);
    expect(character.playTalking).not.toHaveBeenCalled();

    scene.create();

    expect(character.playTalking).toHaveBeenCalledTimes(1);
  });

  it("create() 完成前只保留最后一次目标值（true 后又 false 则不会说话）", () => {
    const { scene } = makeScene();

    scene.setTalking(true);
    scene.setTalking(false);
    scene.create();

    expect(character.playTalking).not.toHaveBeenCalled();
  });
});

describe("MainScene — 场景销毁时清理", () => {
  it("SHUTDOWN 时销毁角色（含眨眼定时器）和背景，之后再收到 DESTROY 不会重复销毁", () => {
    const { scene, emit } = makeScene();
    scene.create();

    emit("shutdown");
    emit("destroy");

    expect(character.destroy).toHaveBeenCalledTimes(1);
    expect(background.destroy).toHaveBeenCalledTimes(1);
  });

  it("只收到 DESTROY（例如整个 Phaser.Game 被销毁）时同样会清理", () => {
    const { scene, emit } = makeScene();
    scene.create();

    emit("destroy");

    expect(character.destroy).toHaveBeenCalledTimes(1);
    expect(background.destroy).toHaveBeenCalledTimes(1);
  });

  it("销毁之后 setTalking 不会再驱动已销毁的角色，也不会抛错", () => {
    const { scene, emit } = makeScene();
    scene.create();
    emit("shutdown");

    expect(() => scene.setTalking(true)).not.toThrow();
    expect(character.playTalking).not.toHaveBeenCalled();
  });
});
