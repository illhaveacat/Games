import Phaser from "phaser";
import { DEFAULT_NPC } from "../dialogue/welcomeMessage";
import { NpcAnimationController } from "./npcAnimationController";
import { ReplayableTalkingState } from "./replayableTalkingState";
import { createCafeSceneArt, type SceneArt } from "./sceneArt";

const NAME_TAG_DEPTH = 30;

export class MainScene extends Phaser.Scene {
  private art?: SceneArt;
  private animationController?: NpcAnimationController;
  private readonly talkingState = new ReplayableTalkingState();

  constructor() {
    super("MainScene");
  }

  create(): void {
    this.cameras.main.setBackgroundColor("#1d2b53");

    this.art = createCafeSceneArt(this);
    this.add
      .text(this.art.nameTag.x, this.art.nameTag.y, DEFAULT_NPC.name, {
        fontFamily: "sans-serif",
        fontSize: "16px",
        color: "#ffffff",
        stroke: "#000000",
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(NAME_TAG_DEPTH);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroyArt());
    this.events.once(Phaser.Scenes.Events.DESTROY, () => this.destroyArt());

    this.animationController = new NpcAnimationController({
      onEnterIdle: () => this.art?.character.playIdle(),
      onEnterTalking: () => this.art?.character.playTalking(),
    });
    // create() 完成前调用过的 setTalking 会被缓冲在这里；attach 时重放最后一次目标值，
    // 若目标是 talking 会立即切换为说话动画。
    this.talkingState.attachController(this.animationController);
  }

  /** 供 React 侧（PhaserGame）在对话开始/结束说话时驱动动画状态切换。 */
  setTalking(isTalking: boolean): void {
    this.talkingState.setTalking(isTalking);
  }

  private destroyArt(): void {
    this.art?.character.destroy();
    this.art?.background.destroy();
    this.art = undefined;
  }
}
