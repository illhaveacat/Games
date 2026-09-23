import { useEffect, useRef } from "react";
import Phaser from "phaser";
import { MainScene } from "./MainScene";

interface PhaserGameProps {
  talking?: boolean;
}

export function PhaserGame({ talking = false }: PhaserGameProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<Phaser.Game | null>(null);

  useEffect(() => {
    if (!containerRef.current || gameRef.current) {
      return undefined;
    }

    gameRef.current = new Phaser.Game({
      type: Phaser.AUTO,
      width: 800,
      height: 480,
      parent: containerRef.current,
      backgroundColor: "#1d2b53",
      scene: [MainScene],
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
