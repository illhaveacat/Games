import { useTranslation } from "react-i18next";
import { useQuestProgress } from "../quests/useQuestProgress";
import { PlayerStatus } from "./PlayerStatus";
import { QuestLog } from "./QuestLog";
import "../i18n";
import "./QuestPanel.css";

/**
 * 任务日志 + 等级/积分展示，数据来自 QUEST-BACKEND-001 的 GET /api/quests、GET /api/progress。
 * 后端进度（比如完成任务后）在页面外发生变化时，点"刷新"重新拉取显示最新数值。
 */
export function QuestPanel() {
  const { t } = useTranslation();
  const { quests, playerProgress, loading, error, refresh } = useQuestProgress();

  return (
    <section className="quest-panel" data-testid="quest-panel">
      <div className="quest-panel__header">
        <PlayerStatus progress={playerProgress} />
        <button type="button" onClick={refresh} disabled={loading} data-testid="quest-panel-refresh">
          {t("questLog.refresh")}
        </button>
      </div>
      {error && (
        <p role="alert" className="quest-panel__error">
          {t("questLog.error")}
        </p>
      )}
      <QuestLog quests={quests} />
    </section>
  );
}
