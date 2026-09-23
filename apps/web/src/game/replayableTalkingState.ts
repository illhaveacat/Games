import type { NpcAnimationController } from "./npcAnimationController";

/**
 * 缓冲 setTalking 的目标值，直到 NpcAnimationController 真正存在（Phaser 场景 create() 完成）后
 * 再应用；避免场景 create() 完成前调用 setTalking 被静默丢弃（CHAR-001 rework：欢迎语的说话动画
 * 因这个时序漏洞永远不会播放）。attachController 之前多次 setTalking 只保留最后一次的值。
 */
export class ReplayableTalkingState {
  private controller?: NpcAnimationController;
  private pending: boolean | null = null;

  attachController(controller: NpcAnimationController): void {
    this.controller = controller;
    if (this.pending !== null) {
      this.apply(this.pending);
      this.pending = null;
    }
  }

  setTalking(isTalking: boolean): void {
    if (this.controller) {
      this.apply(isTalking);
    } else {
      this.pending = isTalking;
    }
  }

  private apply(isTalking: boolean): void {
    if (isTalking) this.controller!.startTalking();
    else this.controller!.stopTalking();
  }
}
