import type Phaser from "phaser";
import { BaristaCharacter } from "./BaristaCharacter";
import { CafeBackground, COUNTER_TOP_Y } from "./CafeBackground";

/** 场景逻辑使用美术资源的全部接口：换成正式美术时，只需要让 createCafeSceneArt 返回同样形状的对象。 */
export interface NpcCharacterArt {
  playIdle(): void;
  playTalking(): void;
  destroy(): void;
}

export interface BackgroundArt {
  destroy(): void;
}

export interface SceneArt {
  background: BackgroundArt;
  character: NpcCharacterArt;
  /** NPC 名字标签在画布上的位置（跟着角色头顶走，所以由美术侧给出）。 */
  nameTag: { x: number; y: number };
}

const CHARACTER_X = 400;
// 角色锚点略低于柜台台面，被前景柜台盖住身体下缘。
const CHARACTER_Y = COUNTER_TOP_Y + 12;
const NAME_TAG_Y = 186;
const CHARACTER_DEPTH = 10;

export function createCafeSceneArt(scene: Phaser.Scene): SceneArt {
  const background = new CafeBackground(scene);
  const character = new BaristaCharacter(scene, { x: CHARACTER_X, y: CHARACTER_Y });
  character.container.setDepth(CHARACTER_DEPTH);
  return { background, character, nameTag: { x: CHARACTER_X, y: NAME_TAG_Y } };
}
