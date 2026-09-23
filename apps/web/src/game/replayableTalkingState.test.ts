import { describe, expect, it, vi } from "vitest";
import { ReplayableTalkingState } from "./replayableTalkingState";
import { NpcAnimationController } from "./npcAnimationController";

describe("ReplayableTalkingState", () => {
  it("buffers setTalking(true) called before the controller is attached, then replays it on attach", () => {
    const onEnterTalking = vi.fn();
    const controller = new NpcAnimationController({ onEnterTalking });
    const state = new ReplayableTalkingState();

    // 复现 CHAR-001 的场景：React 挂载时 talking=true 在 Phaser create() 完成前触发。
    state.setTalking(true);
    expect(controller.currentState).toBe("idle");
    expect(onEnterTalking).not.toHaveBeenCalled();

    state.attachController(controller);

    expect(controller.currentState).toBe("talking");
    expect(onEnterTalking).toHaveBeenCalledTimes(1);
  });

  it("only replays the last buffered value when multiple setTalking calls happen before attach", () => {
    const onEnterTalking = vi.fn();
    const onEnterIdle = vi.fn();
    const controller = new NpcAnimationController({ onEnterTalking, onEnterIdle });
    const state = new ReplayableTalkingState();

    state.setTalking(true);
    state.setTalking(false);

    state.attachController(controller);

    expect(controller.currentState).toBe("idle");
    expect(onEnterTalking).not.toHaveBeenCalled();
    expect(onEnterIdle).not.toHaveBeenCalled();
  });

  it("does nothing on attach when setTalking was never called before it", () => {
    const onEnterTalking = vi.fn();
    const controller = new NpcAnimationController({ onEnterTalking });
    const state = new ReplayableTalkingState();

    state.attachController(controller);

    expect(controller.currentState).toBe("idle");
    expect(onEnterTalking).not.toHaveBeenCalled();
  });

  it("applies immediately (no buffering) once the controller is already attached", () => {
    const onEnterTalking = vi.fn();
    const controller = new NpcAnimationController({ onEnterTalking });
    const state = new ReplayableTalkingState();

    state.attachController(controller);
    state.setTalking(true);

    expect(controller.currentState).toBe("talking");
    expect(onEnterTalking).toHaveBeenCalledTimes(1);
  });
});
