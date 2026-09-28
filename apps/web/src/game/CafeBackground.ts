import type Phaser from "phaser";

const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 480;
export const COUNTER_TOP_Y = 340;

const WALL_COLOR = 0x2b2147;
const WALL_TRIM_COLOR = 0x1d2b53;
const COUNTER_FRONT_COLOR = 0x6e4423;
const COUNTER_TOP_COLOR = 0x8b5a2b;
const MENU_BOARD_COLOR = 0x14101f;
const MENU_LINE_COLOR = 0xf2e9d8;
const MACHINE_BODY_COLOR = 0x3a3a3a;
const MACHINE_TRIM_COLOR = 0xc0392b;
const LAMP_COLOR = 0xf2c14e;
const LAMP_CORD_COLOR = 0x1a1a1a;
const PLANT_POT_COLOR = 0x9c5a34;
const PLANT_LEAF_COLOR = 0x3f7d4a;
const CUP_COLOR = 0xf5f1e8;

/**
 * 咖啡馆背景：墙 + 柜台 + 咖啡机 + 菜单板 + 吊灯/绿植/杯子这几样装饰，全部代码绘制。
 * 独立模块，以后要整体换成正式美术只需要换这一个文件。
 * 分两层：back（墙/菜单板/吊灯/绿植/咖啡机）在角色后面，front（柜台台面和台面上的杯子）在角色前面，
 * 这样角色看起来是站在柜台后面。层级用 depth 表达，场景里创建对象的先后顺序不影响遮挡。
 */
export const CAFE_BACK_DEPTH = 0;
export const CAFE_FRONT_DEPTH = 20;

export class CafeBackground {
  readonly back: Phaser.GameObjects.Container;
  readonly front: Phaser.GameObjects.Container;

  constructor(scene: Phaser.Scene) {
    this.back = scene.add.container(0, 0);
    this.back.setDepth(CAFE_BACK_DEPTH);
    this.back.add([
      drawWall(scene),
      drawMenuBoard(scene),
      drawLamp(scene),
      drawPlant(scene),
      drawCoffeeMachine(scene),
    ]);

    this.front = scene.add.container(0, 0);
    this.front.setDepth(CAFE_FRONT_DEPTH);
    this.front.add([drawCounter(scene), drawCupStack(scene)]);
  }

  destroy(): void {
    this.back.destroy();
    this.front.destroy();
  }
}

function drawWall(scene: Phaser.Scene): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  g.fillStyle(WALL_COLOR, 1);
  g.fillRect(0, 0, CANVAS_WIDTH, COUNTER_TOP_Y);
  g.fillStyle(WALL_TRIM_COLOR, 1);
  g.fillRect(0, COUNTER_TOP_Y - 10, CANVAS_WIDTH, 10);
  return g;
}

function drawMenuBoard(scene: Phaser.Scene): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  const x = 520;
  const y = 40;
  const w = 220;
  const h = 130;
  g.fillStyle(MENU_BOARD_COLOR, 1);
  g.fillRoundedRect(x, y, w, h, 8);
  g.lineStyle(4, 0x6e4423, 1);
  g.strokeRoundedRect(x, y, w, h, 8);
  g.fillStyle(MENU_LINE_COLOR, 1);
  for (let i = 0; i < 4; i += 1) {
    const lineY = y + 26 + i * 24;
    g.fillRoundedRect(x + 18, lineY, 90 - (i % 2) * 20, 6, 3);
  }
  return g;
}

function drawLamp(scene: Phaser.Scene): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  const x = 150;
  g.lineStyle(3, LAMP_CORD_COLOR, 1);
  g.lineBetween(x, 0, x, 60);
  g.fillStyle(LAMP_COLOR, 1);
  g.fillTriangle(x - 26, 60, x + 26, 60, x, 105);
  g.fillCircle(x, 108, 6);
  return g;
}

function drawPlant(scene: Phaser.Scene): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  const x = 60;
  const potTopY = COUNTER_TOP_Y - 4;
  g.fillStyle(PLANT_POT_COLOR, 1);
  g.fillRoundedRect(x - 22, potTopY - 34, 44, 34, 6);
  g.fillStyle(PLANT_LEAF_COLOR, 1);
  g.fillEllipse(x, potTopY - 46, 26, 44);
  g.fillEllipse(x - 20, potTopY - 34, 20, 34);
  g.fillEllipse(x + 20, potTopY - 34, 20, 34);
  return g;
}

function drawCounter(scene: Phaser.Scene): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  g.fillStyle(COUNTER_FRONT_COLOR, 1);
  g.fillRect(0, COUNTER_TOP_Y + 14, CANVAS_WIDTH, CANVAS_HEIGHT - COUNTER_TOP_Y - 14);
  g.fillStyle(COUNTER_TOP_COLOR, 1);
  g.fillRect(0, COUNTER_TOP_Y, CANVAS_WIDTH, 16);
  return g;
}

function drawCoffeeMachine(scene: Phaser.Scene): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  const x = 630;
  const baseY = COUNTER_TOP_Y;
  g.fillStyle(MACHINE_BODY_COLOR, 1);
  g.fillRoundedRect(x - 55, baseY - 90, 110, 90, 8);
  g.fillStyle(MACHINE_TRIM_COLOR, 1);
  g.fillRoundedRect(x - 55, baseY - 90, 110, 14, { tl: 8, tr: 8, bl: 0, br: 0 });
  g.fillStyle(0x1a1a1a, 1);
  g.fillCircle(x - 34, baseY - 58, 5); // 旋钮
  g.fillCircle(x + 34, baseY - 58, 5);
  g.fillStyle(0x6ad07a, 1);
  g.fillCircle(x, baseY - 58, 3); // 指示灯
  g.fillStyle(0x1a1a1a, 1);
  g.fillRect(x - 14, baseY - 48, 28, 8); // 出水口
  g.fillRect(x - 4, baseY - 40, 8, 6);
  g.fillStyle(0x2a2a2a, 1);
  g.fillRect(x - 24, baseY - 12, 48, 12); // 接水盘
  g.fillStyle(CUP_COLOR, 1);
  g.fillRoundedRect(x - 9, baseY - 30, 18, 18, 3); // 接着的咖啡杯
  return g;
}

function drawCupStack(scene: Phaser.Scene): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  const x = 470;
  const baseY = COUNTER_TOP_Y - 2;
  g.fillStyle(CUP_COLOR, 1);
  g.fillRoundedRect(x, baseY - 18, 20, 18, 3);
  g.fillRoundedRect(x + 24, baseY - 24, 20, 24, 3);
  return g;
}
