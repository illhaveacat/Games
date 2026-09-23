import { useTranslation } from "react-i18next";
import type { PlayerProgressView } from "../api/questsClient";
import "../i18n";
import "./PlayerStatus.css";

interface PlayerStatusProps {
  progress: PlayerProgressView | null;
}

export function PlayerStatus({ progress }: PlayerStatusProps) {
  const { t } = useTranslation();

  if (!progress) {
    return null;
  }

  return (
    <div className="player-status" data-testid="player-status">
      <span className="player-status__level" data-testid="player-status-level">
        {t("playerStatus.level", { level: progress.level })}
      </span>
      <span className="player-status__points" data-testid="player-status-points">
        {t("playerStatus.points", { points: progress.points })}
      </span>
    </div>
  );
}
