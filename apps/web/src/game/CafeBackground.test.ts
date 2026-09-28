import { describe, expect, it } from "vitest";
import { CAFE_BACK_DEPTH, CAFE_FRONT_DEPTH, CafeBackground, COUNTER_TOP_Y } from "./CafeBackground";
import { asPhaserScene, createFakeScene, type FakeContainer, type FakeGraphics } from "./fakePhaserScene";

function setup() {
  const scene = createFakeScene();
  const background = new CafeBackground(asPhaserScene(scene));
  const back = background.back as unknown as FakeContainer;
  const front = background.front as unknown as FakeContainer;
  return { scene, background, back, front };
}

describe("CafeBackground", () => {
  it("后层包含墙、菜单板、吊灯、绿植、咖啡机；前层包含柜台和台面上的杯子，都绘制了内容", () => {
    const { back, front } = setup();

    expect(back.list).toHaveLength(5);
    expect(front.list).toHaveLength(2);
    for (const part of [...back.list, ...front.list] as FakeGraphics[]) {
      expect(part.calls.some((c) => c.name.startsWith("fill"))).toBe(true);
    }

    const [wall, menuBoard, lamp, plant, coffeeMachine] = back.list as FakeGraphics[];
    expect(wall.callCount("fillRect")).toBeGreaterThan(0);
    expect(menuBoard.callCount("strokeRoundedRect")).toBe(1); // 带边框的菜单板
    expect(menuBoard.callCount("fillRoundedRect")).toBeGreaterThan(1); // 板面 + 几行菜单文字条
    expect(lamp.callCount("fillTriangle")).toBe(1); // 灯罩
    expect(plant.callCount("fillEllipse")).toBeGreaterThanOrEqual(3); // 叶子
    expect(coffeeMachine.callCount("fillCircle")).toBeGreaterThanOrEqual(2); // 旋钮

    const [counter, cups] = front.list as FakeGraphics[];
    expect(counter.callCount("fillRect")).toBe(2); // 台面 + 柜台正面
    expect(cups.callCount("fillRoundedRect")).toBe(2);
  });

  it("柜台在角色前面、其余在角色后面：后层深度 < 角色深度(10) < 前层深度", () => {
    const { back, front } = setup();

    expect(back.depth).toBe(CAFE_BACK_DEPTH);
    expect(front.depth).toBe(CAFE_FRONT_DEPTH);
    expect(CAFE_BACK_DEPTH).toBeLessThan(10);
    expect(CAFE_FRONT_DEPTH).toBeGreaterThan(10);
  });

  it("柜台台面位置在画布下半部分，留出上方空间给墙面装饰和角色", () => {
    expect(COUNTER_TOP_Y).toBeGreaterThan(240);
    expect(COUNTER_TOP_Y).toBeLessThan(480);
  });

  it("destroy 销毁两层容器", () => {
    const { background, back, front } = setup();

    background.destroy();

    expect(back.destroyed).toBe(true);
    expect(front.destroyed).toBe(true);
  });
});
