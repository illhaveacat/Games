import type Phaser from "phaser";

/** 仅供测试：记录绘制/tween/timer 调用的最小 Phaser 场景替身（真实 Phaser 在 jsdom 下无法初始化）。 */

export interface FakeGraphics {
  kind: "graphics";
  x: number;
  y: number;
  angle: number;
  destroyed: boolean;
  calls: Array<{ name: string; args: unknown[] }>;
  callCount(name: string): number;
  setPosition(x: number, y: number): FakeGraphics;
  clear(): FakeGraphics;
  destroy(): void;
  [method: string]: unknown;
}

export interface FakeContainer {
  kind: "container";
  x: number;
  y: number;
  angle: number;
  scaleY: number;
  depth: number;
  list: unknown[];
  destroyed: boolean;
  add(children: unknown | unknown[]): FakeContainer;
  setDepth(depth: number): FakeContainer;
  destroy(): void;
}

export interface FakeTween {
  config: Record<string, unknown>;
  stopped: boolean;
  stop(): FakeTween;
}

export interface FakeTimer {
  config: { delay: number; loop?: boolean; callback: () => void };
  removed: boolean;
  remove(): void;
  /** 模拟定时器到点触发；和真实 Phaser 一样，非循环定时器触发一次后即失效。 */
  fire(): void;
}

export interface FakeScene {
  add: {
    graphics(): FakeGraphics;
    container(x?: number, y?: number): FakeContainer;
  };
  tweens: { add(config: Record<string, unknown>): FakeTween };
  time: { addEvent(config: FakeTimer["config"]): FakeTimer };
  graphicsCreated: FakeGraphics[];
  containersCreated: FakeContainer[];
  tweensCreated: FakeTween[];
  timersCreated: FakeTimer[];
  activeTimers(): FakeTimer[];
  activeTweens(): FakeTween[];
}

function createGraphics(): FakeGraphics {
  const calls: FakeGraphics["calls"] = [];
  const g: FakeGraphics = {
    kind: "graphics",
    x: 0,
    y: 0,
    angle: 0,
    destroyed: false,
    calls,
    callCount: (name) => calls.filter((c) => c.name === name).length,
    setPosition(x, y) {
      g.x = x;
      g.y = y;
      return g;
    },
    clear() {
      calls.length = 0;
      calls.push({ name: "clear", args: [] });
      return g;
    },
    destroy() {
      g.destroyed = true;
    },
  };
  return new Proxy(g, {
    get(target, prop: string) {
      if (prop in target) return target[prop];
      return (...args: unknown[]) => {
        calls.push({ name: prop, args });
        return target;
      };
    },
  });
}

export function createFakeScene(): FakeScene {
  const graphicsCreated: FakeGraphics[] = [];
  const containersCreated: FakeContainer[] = [];
  const tweensCreated: FakeTween[] = [];
  const timersCreated: FakeTimer[] = [];

  return {
    add: {
      graphics() {
        const g = createGraphics();
        graphicsCreated.push(g);
        return g;
      },
      container(x = 0, y = 0) {
        const c: FakeContainer = {
          kind: "container",
          x,
          y,
          angle: 0,
          scaleY: 1,
          depth: 0,
          list: [],
          destroyed: false,
          add(children) {
            c.list.push(...(Array.isArray(children) ? children : [children]));
            return c;
          },
          setDepth(depth) {
            c.depth = depth;
            return c;
          },
          destroy() {
            c.destroyed = true;
          },
        };
        containersCreated.push(c);
        return c;
      },
    },
    tweens: {
      add(config) {
        const t: FakeTween = {
          config,
          stopped: false,
          stop() {
            t.stopped = true;
            return t;
          },
        };
        tweensCreated.push(t);
        return t;
      },
    },
    time: {
      addEvent(config) {
        const timer: FakeTimer = {
          config,
          removed: false,
          remove() {
            timer.removed = true;
          },
          fire() {
            timer.config.callback();
            if (!timer.config.loop) timer.removed = true;
          },
        };
        timersCreated.push(timer);
        return timer;
      },
    },
    graphicsCreated,
    containersCreated,
    tweensCreated,
    timersCreated,
    activeTimers: () => timersCreated.filter((t) => !t.removed),
    activeTweens: () => tweensCreated.filter((t) => !t.stopped),
  };
}

export function asPhaserScene(scene: FakeScene): Phaser.Scene {
  return scene as unknown as Phaser.Scene;
}
