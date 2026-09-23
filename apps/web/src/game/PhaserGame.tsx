import { useEffect, useRef } from "react";
import Phaser from "phaser";
import { MainScene } from "./MainScene";

interface PhaserGameProps {
  talking?: boolean;
}

export function PhaserGame({ talking = false }: PhaserGameProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const talkingRef = useRef(talking);
  talkingRef.current = talking;

  useEffect(() => {
    if (!containerRef.current || gameRef.current) {
      return undefined;
    }

    const game = new Phaser.Game({
      type: Phaser.AUTO,
      width: 800,
      height: 480,
      parent: containerRef.current,
      backgroundColor: "#1d2b53",
      scene: [MainScene],
    });
    gameRef.current = game;

    // MainScene 只在 Game 的 READY 事件之后才会被加入 SceneManager，
    // 在此之前 getScene() 恒为 undefined，下面 [talking] 的 effect 即使先跑过也不会生效。
    // READY 时重放最新的 talking 值，交给 MainScene 自己的 pending 缓冲去对齐 create() 时序。
    game.events.once(Phaser.Core.Events.READY, () => {
      const scene = game.scene.getScene("MainScene") as MainScene | undefined;
      scene?.setTalking(talkingRef.current);
    });

    return () => {
      gameRef.current?.destroy(true);
      gameRef.current = null;
    };
  }, []);

  useEffect(() => {
    const scene = gameRef.current?.scene.getScene("MainScene") as MainScene | undefined;
    scene?.setTalking(talking);
  }, [talking]);

  return <div ref={containerRef} data-testid="phaser-container" className="phaser-container" />;
}
