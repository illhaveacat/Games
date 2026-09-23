import Phaser from "phaser";
import { DEFAULT_NPC } from "../dialogue/welcomeMessage";

const NPC_TEXTURE_KEY = "npc-texture";

export class MainScene extends Phaser.Scene {
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

    const npc = this.add.sprite(400, 300, NPC_TEXTURE_KEY);
    npc.setName(DEFAULT_NPC.id);

    this.add
      .text(400, 236, DEFAULT_NPC.name, {
        fontFamily: "sans-serif",
        fontSize: "16px",
        color: "#ffffff",
      })
      .setOrigin(0.5);
  }
}
