import { describe, expect, it, vi } from "vitest";
import { NpcAnimationController } from "./npcAnimationController";

describe("NpcAnimationController", () => {
  it("starts in the idle state", () => {
    const controller = new NpcAnimationController();
    expect(controller.currentState).toBe("idle");
  });

  it("switches to talking and fires onEnterTalking exactly once", () => {
    const onEnterTalking = vi.fn();
    const controller = new NpcAnimationController({ onEnterTalking });

    controller.startTalking();
    controller.startTalking();

    expect(controller.currentState).toBe("talking");
    expect(onEnterTalking).toHaveBeenCalledTimes(1);
  });

  it("switches back to idle and fires onEnterIdle exactly once", () => {
    const onEnterIdle = vi.fn();
    const controller = new NpcAnimationController({ onEnterIdle });

    controller.startTalking();
    controller.stopTalking();
    controller.stopTalking();

    expect(controller.currentState).toBe("idle");
    expect(onEnterIdle).toHaveBeenCalledTimes(1);
  });

  it("does not fire onEnterIdle when already idle (no-op)", () => {
    const onEnterIdle = vi.fn();
    const controller = new NpcAnimationController({ onEnterIdle });

    controller.stopTalking();

    expect(controller.currentState).toBe("idle");
    expect(onEnterIdle).not.toHaveBeenCalled();
  });
});
