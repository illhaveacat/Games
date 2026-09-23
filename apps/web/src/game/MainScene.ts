import Phaser from "phaser";
import { DEFAULT_NPC } from "../dialogue/welcomeMessage";
import { NpcAnimationController } from "./npcAnimationController";

const NPC_TEXTURE_KEY = "npc-texture";
const IDLE_BASE_Y = 300;
const IDLE_TINT = 0xffffff;
const TALKING_TINT = 0xfff2b2;

export class MainScene extends Phaser.Scene {
  private npcSprite?: Phaser.GameObjects.Sprite;
  private idleTween?: Phaser.Tweens.Tween;
  private talkingTween?: Phaser.Tweens.Tween;
  private animationController?: NpcAnimationController;

  constructor() {
    super("MainScene");
  }

  create(): void {
    this.cameras.main.setBackgroundColor("#1d2b53");

    const npcGraphics = this.add.graphics();
    npcGraphics.fillStyle(0xffb703, 1);
    npcGraphics.fillRoundedRect(0, 0, 64, 96, 10);
    npcGraphics.generateTexture(NPC_TEXTURE_KEY, 64, 96);
    npcGraphics.destroy();

    this.npcSprite = this.add.sprite(400, IDLE_BASE_Y, NPC_TEXTURE_KEY);
    this.npcSprite.setName(DEFAULT_NPC.id);

    this.add
      .text(400, 236, DEFAULT_NPC.name, {
        fontFamily: "sans-serif",
        fontSize: "16px",
        color: "#ffffff",
      })
      .setOrigin(0.5);

    this.animationController = new NpcAnimationController({
      onEnterIdle: () => this.playIdleAnimation(),
      onEnterTalking: () => this.playTalkingAnimation(),
    });
    this.playIdleAnimation();
  }

  /** 供 React 侧（PhaserGame）在对话开始/结束说话时驱动动画状态切换。 */
  setTalking(isTalking: boolean): void {
    if (!this.animationController) return;
    if (isTalking) this.animationController.startTalking();
    else this.animationController.stopTalking();
  }

  private stopActiveTweens(): void {
    this.idleTween?.stop();
    this.talkingTween?.stop();
    if (this.npcSprite) {
      this.npcSprite.setTint(IDLE_TINT);
      this.npcSprite.setScale(1, 1);
      this.npcSprite.y = IDLE_BASE_Y;
    }
  }

  /** 待机：轻微上下浮动，模拟呼吸感。 */
  private playIdleAnimation(): void {
    if (!this.npcSprite) return;
    this.stopActiveTweens();
    this.idleTween = this.tweens.add({
      targets: this.npcSprite,
      y: IDLE_BASE_Y - 6,
      duration: 900,
      ease: "Sine.easeInOut",
      yoyo: true,
      repeat: -1,
    });
  }

  /** 说话：颜色高亮 + 更快的形状律动，和待机明显区分。 */
  private playTalkingAnimation(): void {
    if (!this.npcSprite) return;
    this.stopActiveTweens();
    this.npcSprite.setTint(TALKING_TINT);
    this.talkingTween = this.tweens.add({
      targets: this.npcSprite,
      scaleX: 0.94,
      scaleY: 1.12,
      duration: 120,
      ease: "Sine.easeInOut",
      yoyo: true,
      repeat: -1,
    });
  }
}
