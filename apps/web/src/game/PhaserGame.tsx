import { useEffect, useRef } from "react";
import Phaser from "phaser";
import { MainScene } from "./MainScene";

export function PhaserGame() {
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

  return <div ref={containerRef} data-testid="phaser-container" className="phaser-container" />;
}
