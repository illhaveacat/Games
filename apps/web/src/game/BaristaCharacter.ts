import type Phaser from "phaser";

export interface BaristaCharacterOptions {
  /** 角色容器的锚点，大致对应"腰部/柜台线"——不画腿，角色站在柜台后面，腿本来就看不见。 */
  x: number;
  y: number;
}

const SKIN_COLOR = 0xffd8b0;
const HAIR_COLOR = 0x4a2c1d;
const SHIRT_COLOR = 0x3a6ea5;
const APRON_COLOR = 0x8b5a2b;
const APRON_STRAP_COLOR = 0x6e4423;
const EYE_WHITE = 0xffffff;
const EYE_PUPIL = 0x1d2b53;
const MOUTH_COLOR = 0x7a3b3b;
const EYEBROW_COLOR = 0x2e1a10;

const HEAD_RADIUS = 24;
const HEAD_Y = -115;
const MOUTH_Y = HEAD_Y + 15;
const EYE_Y = HEAD_Y - 4;
const EYE_OFFSET_X = 9;
const EYEBROW_Y = EYE_Y - 8;

/**
 * 咖啡师 Jamie：全部用 Phaser Graphics/Container 代码绘制，不依赖任何外部图片/AI 生图/付费素材。
 * 头、脸（眉毛/眼睛/嘴巴）、头发、身体、手臂、围裙都是独立的 Graphics，装进两层 Container
 * （headGroup 装头部五官，方便单独做"点头"；外层 container 装全部，方便整体呼吸浮动/定位）。
 *
 * 动画职责划分：
 * - 呼吸 + 眨眼：贯穿 idle 和 talking 两种状态，只在 destroy() 时停止（角色"活着"的持续背景动作）。
 * - 张嘴 + 点头/手势：只在 playTalking() 期间进行，playIdle() 会停掉并把嘴巴复位成闭合。
 */
export class BaristaCharacter {
  readonly container: Phaser.GameObjects.Container;

  private readonly headGroup: Phaser.GameObjects.Container;
  private readonly eyes: Phaser.GameObjects.Container;
  private readonly mouth: Phaser.GameObjects.Graphics;
  private readonly rightArm: Phaser.GameObjects.Graphics;

  private breatheTween?: Phaser.Tweens.Tween;
  private nodTween?: Phaser.Tweens.Tween;
  private gestureTween?: Phaser.Tweens.Tween;
  private blinkTimer?: Phaser.Time.TimerEvent;
  private mouthTimer?: Phaser.Time.TimerEvent;
  private mouthOpen = false;
  private destroyed = false;

  constructor(
    private readonly scene: Phaser.Scene,
    options: BaristaCharacterOptions,
  ) {
    this.container = scene.add.container(options.x, options.y);

    const body = drawBody(scene);
    const leftArm = drawArm(scene, -1);
    this.rightArm = drawArm(scene, 1);
    const apron = drawApron(scene);
    const head = drawHead(scene);
    const hair = drawHair(scene);
    const eyebrows = drawEyebrows(scene);
    this.eyes = drawEyes(scene);
    this.mouth = drawMouth(scene, false);

    this.headGroup = scene.add.container(0, 0);
    this.headGroup.add([head, hair, eyebrows, this.eyes, this.mouth]);

    this.container.add([body, leftArm, this.rightArm, apron, this.headGroup]);

    this.startBreathing();
    this.startBlinking();
  }

  /** 待机：停掉张嘴/点头手势，嘴巴复位成闭合；呼吸和眨眼本来就是持续的，不用额外处理。 */
  playIdle(): void {
    this.stopMouthFlap();
    this.stopNodGesture();
  }

  /** 说话：开始张嘴节奏动画 + 轻微点头/手臂手势。 */
  playTalking(): void {
    this.startMouthFlap();
    this.startNodGesture();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.breatheTween?.stop();
    this.nodTween?.stop();
    this.gestureTween?.stop();
    this.blinkTimer?.remove();
    this.mouthTimer?.remove();
    this.container.destroy();
  }

  private startBreathing(): void {
    const baseY = this.container.y;
    this.breatheTween = this.scene.tweens.add({
      targets: this.container,
      y: baseY - 4,
      duration: 1000,
      ease: "Sine.easeInOut",
      yoyo: true,
      repeat: -1,
    });
  }

  private startBlinking(): void {
    this.scheduleNextBlink();
  }

  private scheduleNextBlink(): void {
    const delay = 2200 + Math.random() * 2600; // 2.2~4.8 秒随机间隔
    this.blinkTimer = this.scene.time.addEvent({
      delay,
      callback: () => {
        this.blink();
        if (!this.destroyed) this.scheduleNextBlink();
      },
    });
  }

  private blink(): void {
    this.scene.tweens.add({
      targets: this.eyes,
      scaleY: 0.08,
      duration: 70,
      ease: "Sine.easeInOut",
      yoyo: true,
    });
  }

  private startMouthFlap(): void {
    if (this.mouthTimer) return;
    this.mouthTimer = this.scene.time.addEvent({
      delay: 150,
      loop: true,
      callback: () => {
        this.mouthOpen = !this.mouthOpen;
        redrawMouth(this.mouth, this.mouthOpen);
      },
    });
  }

  private stopMouthFlap(): void {
    this.mouthTimer?.remove();
    this.mouthTimer = undefined;
    this.mouthOpen = false;
    redrawMouth(this.mouth, false);
  }

  private startNodGesture(): void {
    this.nodTween = this.scene.tweens.add({
      targets: this.headGroup,
      y: -3,
      duration: 220,
      ease: "Sine.easeInOut",
      yoyo: true,
      repeat: -1,
    });
    this.gestureTween = this.scene.tweens.add({
      targets: this.rightArm,
      angle: -10,
      duration: 260,
      ease: "Sine.easeInOut",
      yoyo: true,
      repeat: -1,
    });
  }

  private stopNodGesture(): void {
    this.nodTween?.stop();
    this.gestureTween?.stop();
    this.nodTween = undefined;
    this.gestureTween = undefined;
    this.headGroup.y = 0;
    this.rightArm.angle = 0;
  }
}

function drawBody(scene: Phaser.Scene): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  g.fillStyle(SHIRT_COLOR, 1);
  g.fillRoundedRect(-35, -95, 70, 95, 16);
  return g;
}

function drawArm(scene: Phaser.Scene, side: -1 | 1): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  g.fillStyle(SHIRT_COLOR, 1);
  const x = side * 40;
  g.fillRoundedRect(x - 8, -88, 16, 62, 8);
  g.fillStyle(SKIN_COLOR, 1);
  g.fillCircle(x, -26, 9); // 手
  return g;
}

function drawApron(scene: Phaser.Scene): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  g.fillStyle(APRON_COLOR, 1);
  g.fillRoundedRect(-30, -40, 60, 45, 6);
  g.fillStyle(APRON_STRAP_COLOR, 1);
  g.lineStyle(4, APRON_STRAP_COLOR, 1);
  g.lineBetween(-20, -85, -14, -42);
  g.lineBetween(20, -85, 14, -42);
  g.fillRoundedRect(-14, -34, 28, 14, 3); // 围裙口袋
  return g;
}

function drawHead(scene: Phaser.Scene): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  g.fillStyle(SKIN_COLOR, 1);
  g.fillCircle(0, HEAD_Y, HEAD_RADIUS);
  return g;
}

function drawHair(scene: Phaser.Scene): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  g.fillStyle(HAIR_COLOR, 1);
  g.fillEllipse(0, HEAD_Y - 12, HEAD_RADIUS * 2 + 6, HEAD_RADIUS * 1.1);
  g.fillEllipse(-HEAD_RADIUS + 2, HEAD_Y, 12, 22);
  g.fillEllipse(HEAD_RADIUS - 2, HEAD_Y, 12, 22);
  return g;
}

function drawEyebrows(scene: Phaser.Scene): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  g.fillStyle(EYEBROW_COLOR, 1);
  g.fillRoundedRect(-EYE_OFFSET_X - 5, EYEBROW_Y, 10, 3, 1.5);
  g.fillRoundedRect(EYE_OFFSET_X - 5, EYEBROW_Y, 10, 3, 1.5);
  return g;
}

function drawEyes(scene: Phaser.Scene): Phaser.GameObjects.Container {
  const container = scene.add.container(0, EYE_Y);
  const g = scene.add.graphics();
  g.fillStyle(EYE_WHITE, 1);
  g.fillCircle(-EYE_OFFSET_X, 0, 4.5);
  g.fillCircle(EYE_OFFSET_X, 0, 4.5);
  g.fillStyle(EYE_PUPIL, 1);
  g.fillCircle(-EYE_OFFSET_X, 0.5, 2.2);
  g.fillCircle(EYE_OFFSET_X, 0.5, 2.2);
  container.add(g);
  return container;
}

function drawMouth(scene: Phaser.Scene, open: boolean): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  redrawMouth(g, open);
  return g;
}

function redrawMouth(g: Phaser.GameObjects.Graphics, open: boolean): void {
  g.clear();
  g.fillStyle(MOUTH_COLOR, 1);
  if (open) {
    g.fillEllipse(0, MOUTH_Y, 11, 8);
  } else {
    g.fillRoundedRect(-7, MOUTH_Y - 1, 14, 3, 1.5);
  }
}
