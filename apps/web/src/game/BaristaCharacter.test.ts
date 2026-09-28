import { describe, expect, it } from "vitest";
import { BaristaCharacter } from "./BaristaCharacter";
import {
  asPhaserScene,
  createFakeScene,
  type FakeContainer,
  type FakeGraphics,
  type FakeScene,
} from "./fakePhaserScene";

function setup() {
  const scene = createFakeScene();
  const character = new BaristaCharacter(asPhaserScene(scene), { x: 400, y: 350 });
  const root = character.container as unknown as FakeContainer;
  // 构造顺序：root.list = [身体, 左臂, 右臂, 围裙, 头部组]；头部组.list = [头, 头发, 眉毛, 眼睛, 嘴]
  const [body, leftArm, rightArm, apron, headGroup] = root.list as [
    FakeGraphics,
    FakeGraphics,
    FakeGraphics,
    FakeGraphics,
    FakeContainer,
  ];
  const [head, hair, eyebrows, eyes, mouth] = headGroup.list as [
    FakeGraphics,
    FakeGraphics,
    FakeGraphics,
    FakeContainer,
    FakeGraphics,
  ];
  return { scene, character, root, body, leftArm, rightArm, apron, headGroup, head, hair, eyebrows, eyes, mouth };
}

function isMouthOpen(mouth: FakeGraphics): boolean {
  return mouth.callCount("fillEllipse") > 0;
}

function timersByDelay(scene: FakeScene, predicate: (delay: number) => boolean) {
  return scene.activeTimers().filter((t) => predicate(t.config.delay));
}

describe("BaristaCharacter — 各部件", () => {
  it("创建了头、脸（头发/眉毛/眼睛/嘴）、身体、双臂和围裙，且都绘制了内容", () => {
    const { root, body, leftArm, rightArm, apron, headGroup, head, hair, eyebrows, eyes, mouth } = setup();

    expect(root.list).toHaveLength(5);
    expect(headGroup.list).toHaveLength(5);

    for (const part of [body, leftArm, rightArm, apron, head, hair, eyebrows, mouth]) {
      expect(part.kind).toBe("graphics");
      expect(part.calls.some((c) => c.name.startsWith("fill"))).toBe(true);
    }
    expect(head.callCount("fillCircle")).toBe(1);
    expect(eyes.kind).toBe("container");
    const eyeGraphics = eyes.list[0] as FakeGraphics;
    expect(eyeGraphics.callCount("fillCircle")).toBe(4); // 两只眼睛各有眼白 + 瞳孔
    expect(eyebrows.callCount("fillRoundedRect")).toBe(2);
  });

  it("手臂以肩膀为原点（左右对称），围裙盖在身体之上、头部组在最上层", () => {
    const { root, body, leftArm, rightArm, apron, headGroup } = setup();

    expect(root.list.indexOf(body)).toBeLessThan(root.list.indexOf(apron));
    expect(root.list.indexOf(apron)).toBeLessThan(root.list.indexOf(headGroup));
    expect(leftArm.x).toBe(-rightArm.x);
    expect(rightArm.x).toBeGreaterThan(0);
  });

  it("初始为闭嘴", () => {
    const { mouth } = setup();
    expect(isMouthOpen(mouth)).toBe(false);
    expect(mouth.callCount("fillRoundedRect")).toBe(1);
  });
});

describe("BaristaCharacter — 待机：呼吸与随机眨眼", () => {
  it("构造后立即开始无限循环的呼吸浮动，并安排了一次眨眼定时器", () => {
    const { scene, root } = setup();

    const breathing = scene.tweensCreated.filter((t) => t.config.targets === root);
    expect(breathing).toHaveLength(1);
    expect(breathing[0].config).toMatchObject({ yoyo: true, repeat: -1 });
    expect(breathing[0].config.y).toBeLessThan(350);

    const blinkTimers = scene.activeTimers();
    expect(blinkTimers).toHaveLength(1);
    expect(blinkTimers[0].config.loop).toBeFalsy();
    expect(blinkTimers[0].config.delay).toBeGreaterThanOrEqual(2200);
    expect(blinkTimers[0].config.delay).toBeLessThanOrEqual(4800);
  });

  it("眨眼定时器触发：眼睛压扁再还原（yoyo），并重新安排下一次眨眼", () => {
    const { scene, eyes } = setup();
    const first = scene.activeTimers()[0];

    first.fire();

    const blink = scene.tweensCreated.find((t) => t.config.targets === eyes);
    expect(blink).toBeDefined();
    expect(blink!.config).toMatchObject({ yoyo: true });
    expect(blink!.config.scaleY).toBeLessThan(0.2);
    expect(scene.timersCreated).toHaveLength(2);
  });

  it("眨眼间隔是随机的，不是固定节拍", () => {
    const scene = createFakeScene();
    new BaristaCharacter(asPhaserScene(scene), { x: 0, y: 0 });
    for (let i = 0; i < 20; i += 1) scene.activeTimers().at(-1)!.fire();

    const delays = new Set(scene.timersCreated.map((t) => t.config.delay));
    expect(delays.size).toBeGreaterThan(1);
  });
});

describe("BaristaCharacter — 说话：嘴巴节奏开合 + 点头/手势", () => {
  it("playTalking 启动循环的张嘴定时器，每次触发嘴型在张开/闭合之间切换", () => {
    const { scene, character, mouth } = setup();
    const before = scene.activeTimers().length;

    character.playTalking();

    const flap = scene.activeTimers().slice(before);
    expect(flap).toHaveLength(1);
    expect(flap[0].config.loop).toBe(true);

    flap[0].fire();
    expect(isMouthOpen(mouth)).toBe(true);
    flap[0].fire();
    expect(isMouthOpen(mouth)).toBe(false);
    flap[0].fire();
    expect(isMouthOpen(mouth)).toBe(true);
  });

  it("playTalking 同时启动点头（头部组）和手臂手势（右臂）两个无限 tween", () => {
    const { scene, character, headGroup, rightArm } = setup();
    const before = scene.tweensCreated.length;

    character.playTalking();

    const added = scene.tweensCreated.slice(before);
    expect(added.find((t) => t.config.targets === headGroup)?.config).toMatchObject({ repeat: -1, yoyo: true });
    expect(added.find((t) => t.config.targets === rightArm)?.config).toMatchObject({ repeat: -1, yoyo: true });
  });

  it("重复调用 playTalking 不会叠加第二组定时器/tween", () => {
    const { scene, character } = setup();

    character.playTalking();
    const timers = scene.timersCreated.length;
    const tweens = scene.tweensCreated.length;
    character.playTalking();

    expect(scene.timersCreated).toHaveLength(timers);
    expect(scene.tweensCreated).toHaveLength(tweens);
  });

  it("playIdle 停掉张嘴与点头/手势，嘴巴闭上，头和手臂回到原位", () => {
    const { scene, character, mouth, headGroup, rightArm } = setup();
    character.playTalking();
    const flap = scene.activeTimers().at(-1)!;
    flap.fire(); // 嘴张开
    headGroup.y = -3;
    rightArm.angle = -12;

    character.playIdle();

    expect(flap.removed).toBe(true);
    expect(isMouthOpen(mouth)).toBe(false);
    expect(headGroup.y).toBe(0);
    expect(rightArm.angle).toBe(0);
    const talkingTweens = scene.tweensCreated.filter(
      (t) => t.config.targets === headGroup || t.config.targets === rightArm,
    );
    expect(talkingTweens.length).toBeGreaterThan(0);
    expect(talkingTweens.every((t) => t.stopped)).toBe(true);
  });

  it("playIdle 之后再次 playTalking 会重新启动动画", () => {
    const { scene, character } = setup();
    character.playTalking();
    character.playIdle();
    const timers = scene.timersCreated.length;

    character.playTalking();

    expect(scene.timersCreated).toHaveLength(timers + 1);
    expect(scene.activeTimers().at(-1)!.config.loop).toBe(true);
  });

  it("说话期间眨眼和呼吸不受影响（只有 destroy 才停）", () => {
    const { scene, character, root } = setup();
    character.playTalking();
    character.playIdle();

    const breathing = scene.tweensCreated.find((t) => t.config.targets === root)!;
    expect(breathing.stopped).toBe(false);
    expect(timersByDelay(scene, (d) => d >= 2200)).toHaveLength(1);
  });
});

describe("BaristaCharacter — destroy 清理", () => {
  it("清理呼吸 tween、眨眼定时器、张嘴定时器、点头/手势 tween，并销毁容器", () => {
    const { scene, character, root } = setup();
    character.playTalking();
    scene.activeTimers()[0].fire(); // 正在眨眼中
    expect(scene.activeTimers().length).toBeGreaterThan(0);

    character.destroy();

    expect(scene.activeTimers()).toHaveLength(0);
    expect(scene.activeTweens()).toHaveLength(0);
    expect(root.destroyed).toBe(true);
  });

  it("destroy 之后已排队的眨眼回调不会再安排新的定时器", () => {
    const { scene, character } = setup();
    const pendingBlink = scene.activeTimers()[0];

    character.destroy();
    const timers = scene.timersCreated.length;
    pendingBlink.fire();

    expect(scene.timersCreated).toHaveLength(timers);
  });

  it("重复 destroy 是安全的", () => {
    const { character } = setup();
    character.destroy();
    expect(() => character.destroy()).not.toThrow();
  });
});
