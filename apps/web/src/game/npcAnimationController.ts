export type NpcAnimationState = "idle" | "talking";

export interface NpcAnimationHandlers {
  onEnterIdle?: () => void;
  onEnterTalking?: () => void;
}

/**
 * 纯状态机：管理 NPC 待机/说话两种动画状态的切换，和 Phaser 场景/tween 解耦，
 * 便于在不启动真实 Canvas/WebGL 的情况下单测状态切换逻辑。
 */
export class NpcAnimationController {
  private state: NpcAnimationState = "idle";

  constructor(private readonly handlers: NpcAnimationHandlers = {}) {}

  get currentState(): NpcAnimationState {
    return this.state;
  }

  startTalking(): void {
    if (this.state === "talking") return;
    this.state = "talking";
    this.handlers.onEnterTalking?.();
  }

  stopTalking(): void {
    if (this.state === "idle") return;
    this.state = "idle";
    this.handlers.onEnterIdle?.();
  }
}
